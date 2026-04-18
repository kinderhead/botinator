import { ButtonStyle, EmbedBuilder } from "discord.js";
import { CustomButton, CustomButtonInitializer, Page } from "../navigation.js";

export class EmbedPager extends Page {
    public additionalButtons: CustomButton[];
    public index = 0;
    public wrap = false;

    constructor(public embeds: EmbedBuilder[], additionalButtons: CustomButtonInitializer<EmbedPager>[]) {
        super();
        this.additionalButtons = additionalButtons.map(i => CustomButton.from(i));
    }

    public override getEmbed(): EmbedBuilder {
        if (this.embeds.length == 0) {
            return new EmbedBuilder().setTitle("Nothing here").setDescription("Add embeds to `EmbedPager`");
        }

        if (this.index < 0) this.index = 0;
        else if (this.index >= this.embeds.length) this.index = this.embeds.length - 1;

        return this.embeds[this.index];
    }

    public override getButtons(): CustomButton[] {
        const buttons: CustomButton[] = [];

        if (this.embeds.length >= 2 && (this.wrap || this.index != 0)) {
            buttons.push(new CustomButton("Previous", ButtonStyle.Primary, (msg => {
                if (this.index == 0) this.index = this.embeds.length - 1;
                else this.index--;
            })));
        }

        buttons.push(...this.additionalButtons);

        if (this.embeds.length >= 2 && (this.wrap || this.index != this.embeds.length - 1)) {
            buttons.push(new CustomButton("Next", ButtonStyle.Primary, (msg => {
                if (this.index == this.embeds.length - 1) this.index = 0;
                else this.index++;
            })));
        }

        return buttons;
    }
}