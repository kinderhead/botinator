import { AnyComponentBuilder, APIActionRowComponent, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, Channel, ChannelSelectMenuBuilder, ChannelSelectMenuInteraction, ChannelType, ChatInputCommandInteraction, ComponentType, EmbedBuilder, InteractionEditReplyOptions, InteractionResponse, MentionableSelectMenuBuilder, Message, MessageComponentInteraction, RoleSelectMenuBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, APIButtonComponent, StringSelectMenuInteraction } from "discord.js";
import { createCustomId, quickActionRow } from "./utils.js";
import { Loggable } from "./logutils.js";

export class CustomButton {
    public readonly label: string;
    public readonly style: ButtonStyle;
    public readonly onClick: (msg: ButtonInteraction) => any;
    public readonly customId = createCustomId();

    constructor(label: string, style: ButtonStyle, onClick: (msg: ButtonInteraction) => Promise<void> | void) {
        this.label = label;
        this.style = style;
        this.onClick = onClick;
    }

    public build() {
        return new ButtonBuilder().setLabel(this.label).setStyle(this.style).setCustomId(this.customId);
    }
}

export class CustomLinkButton extends CustomButton {
    public readonly link: string;

    constructor(label: string, link: string) {
        super(label, ButtonStyle.Link, () => { });
        this.link = link;
    }

    public override build() {
        return new ButtonBuilder().setLabel(this.label).setStyle(this.style).setURL(this.link);
    }
}

export abstract class ExtraElement {
    public abstract build(): AnyComponentBuilder;
    public abstract isValidInteraction(msg: MessageComponentInteraction): boolean;
    public abstract onInteraction(msg: MessageComponentInteraction): Promise<void>;
}

export type SelectorTypes = ChannelSelectMenuBuilder | MentionableSelectMenuBuilder | RoleSelectMenuBuilder | StringSelectMenuBuilder | UserSelectMenuBuilder;

export abstract class Selector<T extends SelectorTypes, TInt extends MessageComponentInteraction, TRet> extends ExtraElement {
    public readonly placeholder: string;
    public readonly min: number | null;
    public readonly max: number | null;
    public readonly onSelect: (msg: TInt, objs: TRet[]) => any;
    public readonly customId = createCustomId();

    constructor(placeholder: string, onSelect: (msg: TInt, objs: TRet[]) => any, min: number | null = null, max: number | null = null) {
        super();

        this.placeholder = placeholder;
        this.min = min;
        this.max = max;
        this.onSelect = onSelect;
    }

    public override build() {
        var selector = this.getSelect().setPlaceholder(this.placeholder).setCustomId(this.customId);

        if (this.min !== null) selector.setMinValues(this.min);
        if (this.max !== null) selector.setMinValues(this.max);

        return selector;
    }

    public override async onInteraction(msg: MessageComponentInteraction): Promise<void> {
        if (this.typeSafeIsValidInteraction(msg)) {
            await this.onSelect(msg, this.getValues(msg));
        }
    }

    public override isValidInteraction(msg: MessageComponentInteraction): boolean {
        return msg.customId == this.customId && this.typeSafeIsValidInteraction(msg);
    }

    protected abstract getSelect(): T;
    protected abstract getValues(msg: TInt): TRet[];

    /**
     * Typesafe version of {@link isValidInteraction}. Override this method instead;
     * @param msg Interaction
     */
    protected abstract typeSafeIsValidInteraction(msg: MessageComponentInteraction): msg is TInt;
}

export class ChannelSelector<T extends Channel> extends Selector<ChannelSelectMenuBuilder, ChannelSelectMenuInteraction, T> {
    public readonly channelTypes: ChannelType[];

    constructor(placeholder: string, onSelect: (msg: ChannelSelectMenuInteraction, objs: T[]) => any, min ?: number | null, max ?: number | null, channelTypes: ChannelType[] = []) {
        super(placeholder, onSelect, min, max);
        this.channelTypes = channelTypes;
    }

    protected getSelect(): ChannelSelectMenuBuilder {
        return new ChannelSelectMenuBuilder().addChannelTypes(...this.channelTypes);
    }

    protected getValues(msg: ChannelSelectMenuInteraction<CacheType>): T[] {
        var channels: T[] = [];
        for (const i of msg.channels.values()) {
            channels.push(i as T);
        }
        return channels;
    }

    protected typeSafeIsValidInteraction(msg: MessageComponentInteraction): msg is ChannelSelectMenuInteraction<CacheType> {
        return msg.isChannelSelectMenu();
    }
}

export class StringSelector extends Selector<StringSelectMenuBuilder, StringSelectMenuInteraction, string> {
    public readonly options: string[];
    public selected: string[];

    constructor(placeholder: string, onSelect: (msg: StringSelectMenuInteraction, objs: string[]) => any, min ?: number | null, max ?: number | null, options: string[] = [], selected: string[] = []) {
        super(placeholder, onSelect, min, max);
        this.options = options;
        this.selected = selected;
    }

    protected getSelect() {
        return new StringSelectMenuBuilder().addOptions(this.options.map(i => ({ label: i, value: i, default: this.selected.includes(i) })));
    }

    protected getValues(msg: StringSelectMenuInteraction<CacheType>): string[] {
        this.selected = msg.values;
        return msg.values;
    }

    protected typeSafeIsValidInteraction(msg: MessageComponentInteraction): msg is StringSelectMenuInteraction<CacheType> {
        return msg.isStringSelectMenu();
    }
}

export class Navigation {
    private readonly stack: Page[] = [];
    private readonly msg: ChatInputCommandInteraction;

    constructor(msg: ChatInputCommandInteraction) {
        this.msg = msg;
    }

    public refresh(): void;
    public refresh(int: MessageComponentInteraction): void;
    public refresh(int?: MessageComponentInteraction) {
        this.navigate(this.stack[this.stack.length - 1], int);
    }

    public back(): void;
    public back(int: MessageComponentInteraction): void;
    public back(int?: MessageComponentInteraction) {
        this.stack.pop();
        this.navigate(this.stack[this.stack.length - 1], int);
    }

    public navigate(page: Page): void;
    public navigate(page: Page, int: MessageComponentInteraction): void;
    public navigate(page: Page, int?: MessageComponentInteraction) {
        page.nav = this;

        var newInt: Promise<Message | InteractionResponse>;
        var buttons = page.getButtons();
        var extras = page.getExtras();

        if (this.stack[this.stack.length - 1] != page) this.stack.push(page);
        if (this.stack.length > 1) buttons = [new CustomButton("Back", ButtonStyle.Secondary, this.back.bind(this)), ...buttons];

        var baseEmbed = page.getEmbed();
        var reply = {
            embeds: [baseEmbed],
            components: [
                ...extras.map(i => quickActionRow(i.build()).toJSON())
            ] as APIActionRowComponent<APIButtonComponent>[]
        };
        if (buttons.length != 0) reply.components.push(quickActionRow(...buttons.map(i => i.build())).toJSON());
        if (buttons.length > 5) throw new Error("More than 5 buttons have not been implemented yet");

        if (int === undefined) {
            if (this.msg.replied || this.msg.deferred) newInt = this.msg.editReply(reply);
            else newInt = this.msg.reply(reply);
        }
        else {
            newInt = int.update(reply);
            int.replied = true;
        }

        newInt.then(async (newInt) => {
            try {
                var timer: NodeJS.Timeout | null = null;

                if (page.useUpdater()) {
                    timer = setInterval(async () => {
                        try {
                            var newEmbed = await page.updater();
                            if (JSON.stringify(baseEmbed.toJSON()) != JSON.stringify(newEmbed.toJSON())) {
                                await newInt.edit({ embeds: [newEmbed] });
                            }
                        } catch {
                            clearInterval(timer);
                        }
                    }, 1000);
                }

                var i = await newInt.awaitMessageComponent({ time: 30 * 60 * 1000, filter: i => i.user.id === this.msg.user.id });
                if (timer) clearInterval(timer);

                if (i.isButton()) {
                    for (const e of buttons) {
                        if (e.customId === i.customId) {
                            await e.onClick(i);
                            break;
                        }
                    }
                } else {
                    for (const e of extras) {
                        if (e.isValidInteraction(i)) {
                            await e.onInteraction(i);
                            break;
                        }
                    }
                }

                if (!i.replied) this.refresh(i);
                else if (this.stack[this.stack.length - 1] == page) this.refresh();
            }
            catch {
                // Timeout
                try {
                    if (this.stack[this.stack.length - 1] == page) await this.msg.editReply({ embeds: reply.embeds, components: [] });
                } catch {

                }
            }
        });
    }
}

export abstract class Page extends Loggable {
    public nav: Navigation;

    public abstract getEmbed(): EmbedBuilder;

    /**
     * Gets all the buttons this page uses
     */
    public abstract getButtons(): CustomButton[];

    /**
     * Gets all the extra message components this page uses
     */
    public getExtras(): ExtraElement[] {
        return [];
    }

    public useUpdater(): boolean {
        return false;
    }

    public async updater(): Promise<EmbedBuilder> {
        return this.getEmbed();
    }
}