import { AutocompleteInteraction, CacheType, ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import { Bot } from "./bot.js";
import { Loggable } from "./logutils.js";

export abstract class Command<TUser, TBot extends Bot<TUser>> extends Loggable {
    public readonly bot: TBot;

    public abstract getName(): string;
    public abstract create(): SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
    public abstract execute(msg: ChatInputCommandInteraction<CacheType>, user: TUser): Promise<void>;

    public autocomplete(cmd: AutocompleteInteraction): Promise<void> { return new Promise<void>(() => { }); }

    public constructor(bot: TBot) {
        super();
        this.bot = bot;
    }
}
