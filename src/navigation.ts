import { AnyComponentBuilder, APIActionRowComponent, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, Channel, ChannelSelectMenuBuilder, ChannelSelectMenuInteraction, ChannelType, ChatInputCommandInteraction, ComponentType, EmbedBuilder, InteractionEditReplyOptions, InteractionResponse, MentionableSelectMenuBuilder, Message, MessageComponentInteraction, RoleSelectMenuBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, APIButtonComponent } from "discord.js";
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
            await this.onSelect(msg, await this.getValues(msg));
        } else {
            throw new Error("Invalid interaction type");
        }
    }

    public override isValidInteraction(msg: MessageComponentInteraction): boolean {
        return this.typeSafeIsValidInteraction(msg);
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

export class Navigation {
    private readonly stack: Page[] = [];
    private readonly msg: ChatInputCommandInteraction;

    constructor(msg: ChatInputCommandInteraction) {
        this.msg = msg;
    }

    public async refresh(): Promise<void>;
    public async refresh(int: MessageComponentInteraction): Promise<void>;
    public async refresh(int?: MessageComponentInteraction) {
        await this.navigate(this.stack[this.stack.length - 1], int);
    }

    public async back(): Promise<void>;
    public async back(int: MessageComponentInteraction): Promise<void>;
    public async back(int?: MessageComponentInteraction) {
        this.stack.pop();
        await this.navigate(this.stack[this.stack.length - 1], int);
    }

    public async navigate(page: Page): Promise<void>;
    public async navigate(page: Page, int: MessageComponentInteraction): Promise<void>;
    public async navigate(page: Page, int?: MessageComponentInteraction) {
        page.nav = this;

        var newInt: Message | InteractionResponse;
        var buttons = page.getButtons();
        var extras = page.getExtras();

        if (this.stack[this.stack.length - 1] != page) this.stack.push(page);
        if (this.stack.length > 1) buttons = [new CustomButton("Back", ButtonStyle.Secondary, this.back.bind(this)), ...buttons];

        var reply = {
            embeds: [page.getEmbed()],
            components: [
                ...extras.map(i => quickActionRow(i.build()).toJSON())
            ] as APIActionRowComponent<APIButtonComponent>[]
        };
        if (buttons.length != 0) reply.components.push(quickActionRow(...buttons.map(i => i.build())).toJSON());
        if (buttons.length > 5) throw new Error("More than 5 buttons have not been implemented yet");

        if (int === undefined) {
            if (this.msg.replied || this.msg.deferred) newInt = await this.msg.editReply(reply);
            else newInt = await this.msg.reply(reply);
        } else newInt = await int.update(reply);

        var collector = newInt.createMessageComponentCollector({ time: 30 * 60 * 1000, filter: i => i.user.id === this.msg.user.id });

        collector.on("collect", async i => {
            if (collector.ended) return;

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

            if (this.stack[this.stack.length - 1] != page) collector.stop();
        });

        collector.on("end", async () => {
            try {
                if (this.stack[this.stack.length - 1] == page) await this.msg.editReply({ embeds: reply.embeds, components: [] });
            } catch {

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
}