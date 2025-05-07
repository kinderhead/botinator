import { AutocompleteInteraction, CacheType, ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import { Bot } from "./bot.js";
import { Loggable } from "./logutils.js";

export type CommandBuilderTypes = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;

/**
 * The base class for creating commands.
 * 
 * See {@link Bot.refreshCommands} for an example implementation.
 */
export abstract class Command<TUser, TBot extends Bot<TUser>> extends Loggable {
    public readonly bot: TBot;

    /**
     * The name of the command.
     * 
     * @returns The name
     */
    public abstract getName(): string;

    /**
     * Create the {@link SlashCommandBuilder}.
     * 
     * @returns The command
     */
    public abstract create(): CommandBuilderTypes;

    /**
     * @returns If this command is a global command
     */
    public globalCommand() {
        return false;
    }

    /**
     * @returns If this command is a guild command
     */
    public guildCommand() {
        return true;
    }
    
    /**
     * Runs when the command is run.
     * 
     * @param msg Command interaction
     * @param user User who ran it
     */
    public abstract execute(msg: ChatInputCommandInteraction<CacheType>, user: TUser): Promise<void>;

    /**
     * Runs when the command is run only if the command is run in a DM or in a server without the bot
     * 
     * @param msg Command interaction
     */
    public async userlessExecute(msg: ChatInputCommandInteraction<CacheType>) {

    }

    /**
     * Runs when an autocomplete interaction is called for this function.
     * 
     * @param cmd Autocomplete interaction.
     */
    public autocomplete(cmd: AutocompleteInteraction): Promise<void> { return new Promise<void>(() => { }); }

    /**
     * Creates an instance of this command.
     * 
     * @param bot Bot
     */
    public constructor(bot: TBot) {
        super();
        this.bot = bot;
    }
}
