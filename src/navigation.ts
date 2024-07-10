import { ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, ComponentType, EmbedBuilder, InteractionResponse, Message } from "discord.js";
import { createCustomId, quickActionRow } from "./utils.js";

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

    constructor(label: string, link: string, onClick: (msg: ButtonInteraction) => Promise<void> | void) {
        super(label, ButtonStyle.Link, onClick);
        this.link = link;
    }

    public override build() {
        return new ButtonBuilder().setLabel(this.label).setStyle(this.style).setURL(this.link).setCustomId(this.customId);
    }
}

export class Navigation {
    private readonly stack: Page[] = [];
    private readonly msg: ChatInputCommandInteraction;

    constructor(msg: ChatInputCommandInteraction) {
        this.msg = msg;
    }

    public async navigate(page: Page): Promise<void>;
    public async navigate(page: Page, int: ButtonInteraction): Promise<void>;

    public async navigate(page: Page, int?: ButtonInteraction) {
        page.nav = this;

        var newInt: Message | InteractionResponse;
        var buttons = page.getButtons();

        if (this.stack[this.stack.length - 1] != page) this.stack.push(page);
        if (this.stack.length > 1) buttons = [new CustomButton("Back", ButtonStyle.Secondary, async i => {
            this.stack.pop();
            await this.navigate(this.stack[this.stack.length - 1], i);
        }), ...buttons];

        var reply = { embeds: [page.getEmbed()], components: [quickActionRow(...buttons.map(i => i.build()))] };
        if (buttons.length == 0) reply.components = [];
        else if (reply.components[0].components.length > 5) throw new Error("More than 5 buttons have not been implemented yet");

        if (int === undefined) {
            if (this.msg.replied || this.msg.deferred) newInt = await this.msg.editReply(reply);
            else newInt = await this.msg.reply(reply);
        } else newInt = await int.update(reply);

        var collector = newInt.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30 * 60 * 1000, filter: i => i.user.id === this.msg.user.id });

        collector.on("collect", async i => {
            if (collector.ended) return;

            for (const e of buttons) {
                if (e.customId === i.customId) {
                    await e.onClick(i);
                    if (this.stack[this.stack.length - 1] != page) collector.stop();
                    break;
                }
            }
        });

        collector.on("end", async () => {
            if (this.stack[this.stack.length - 1] == page) await this.msg.editReply({ embeds: reply.embeds, components: [] });
        });
    }
}

export abstract class Page {
    public nav: Navigation;

    public abstract getEmbed(): EmbedBuilder;

    /**
     * Gets all the buttons this page uses
     */
    public abstract getButtons(): CustomButton[];
}