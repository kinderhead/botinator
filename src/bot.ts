import { Client, Events, Guild, GuildBasedChannel, GuildMember, Interaction, Message, PartialGuildMember, Role, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, TextChannel, VoiceState, roleMention } from "discord.js";
import util from 'node:util';
import { RotatingFileStream, createStream } from "rotating-file-stream";
import { ILogObj, Logger } from "tslog";
import { Component } from "./component.js";
import { Command, CommandBuilderTypes } from "./command.js";

export const LOG_CONFIG = {
    DEFAULT_LOGGER: new Logger<ILogObj>({ name: "Bot", type: "pretty", hideLogPositionForProduction: false, prettyLogTimeZone: "local", minLevel: 2, prettyLogTemplate: "{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{fileNameWithLine}}\t{{logLevelName}}\t[{{name}}] " }),
    LOGGER_STREAM: null as RotatingFileStream
}

export const DEBUG = process.argv.includes("--debug");

/**
 * The heart of your bot. Subclass this to get started.
 * 
 * @typeParam TUser The default user object
 */
export abstract class Bot<TUser = GuildMember> {
    private clientID: string;
    private secret: string;

    public client: Client;

    public readonly log = LOG_CONFIG.DEFAULT_LOGGER;
    public logChannel: TextChannel;
    public errorPing: Role;

    public components: Component<TUser, Bot<TUser>>[] = [];
    public commands: Command<Bot<TUser>>[] = [];

    public hasStarted = false;

    /**
     * Create a bot.
     * 
     * @param clientID Client ID (unused right now)
     * @param secret Bot secret
     * @param client Base Discord client with intentions set
     */
    public constructor(clientID: string, secret: string, client: Client) {
        this.client = client;
        this.clientID = clientID;
        this.secret = secret;

        // Me not like this
        const oldlog = console.log;
        console.log = (message?: any, ...optionalParams: any[]) => {
            var txt: string = message;
            if (optionalParams.length != 0) {
                txt = util.format(message, optionalParams);
            }
            oldlog(txt);

            if (this.logChannel && this.hasStarted && !txt.includes("anon") && !txt.includes("DEBUG")) {
                var msg = "```ansi\n" + txt.substring(42).trim() + "\n```";

                if (this.errorPing && ((txt.includes("ERROR") || txt.includes("FATAL")) && !DEBUG)) {
                    msg = `${roleMention(this.errorPing.id)}\n` + msg;
                }

                this.logChannel.send(msg);
            }

            if (LOG_CONFIG.LOGGER_STREAM != null && !txt.includes("DEBUG")) {
                txt = txt.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
                LOG_CONFIG.LOGGER_STREAM.write(txt + "\n");
            }
        }

        console.log("");

        this.client.once(Events.ClientReady, this.onLogin.bind(this));

        this.client.on(Events.InteractionCreate, this.onInteraction.bind(this));
        this.client.on(Events.MessageCreate, this.onMessage.bind(this));
        this.client.on(Events.GuildMemberAdd, this.onNewMember.bind(this));
        this.client.on(Events.GuildMemberRemove, this.onMemberLeave.bind(this));
        this.client.on(Events.GuildCreate, this.onGuildJoin.bind(this));
        this.client.on(Events.VoiceStateUpdate, this.onUserVoiceStateUpdate.bind(this));

        this.client.on(Events.Error, e => { this.log.fatal(e); });
    }

    /**
     * Runs right before the client logs in.
     */
    protected abstract init(): void;

    /**
     * Register a command.
     * 
     * @param command Command to register
     */
    public registerCommand(command: Command<Bot<TUser>>) {
        this.commands.push(command);
    }

    /**
     * Start the bot.
     */
    public async run() {
        this.init();

        try {
            await this.client.login(this.secret);
        } finally {
            await this.onClose();
        }
    }

    /**
     * Runs after the bot logs in.
     * 
     * @param c Client
     */
    public async onLogin(c: Client) {
        this.log.info("Logging in");
        this.log.silly("Bot in " + this.client.guilds.cache.size + " servers");

        for (const i of this.components) {
            i.init();
        }

        this.hasStarted = true;
    }

    /**
     * Runs when a user joins.
     * 
     * @param user User
     */
    public async onNewMember(user: GuildMember) { }

    /**
     * Runs when a user leaves.
     * 
     * @param user User
     */
    public async onMemberLeave(user: GuildMember | PartialGuildMember) { }

    /**
     * Runs when the bot joins a guild.
     * 
     * @param guild Guild
     */
    public async onGuildJoin(guild: Guild) { }

    /**
     * Runs when a message is sent.
     * 
     * @param msg Message
     */
    public async onMessage(msg: Message) { }

    /**
     * Runs when there is an interaction.
     * 
     * @param message Interaction
     */
    public async onInteraction(message: Interaction) {
        if (message.isAutocomplete() || message.isChatInputCommand()) {
            const cmd = this.commands.find(i => i.getName() == message.commandName);
            if (!cmd) {
                this.log.error("Cannot find command " + message.commandName);
                return;
            }

            if (message.isAutocomplete()) {
                await cmd.autocomplete(message);
            } else if (message.isChatInputCommand()) {
                try {
                    if (message.inCachedGuild()) await cmd.execute(message, this.getUserV2(message.user.id, message.guildId));
                    else await cmd.userlessExecute(message);
                } catch (error) {
                    this.log.error(error);
                    try {
                        if (message.replied || message.deferred) await message.editReply("An error occured running this command");
                        else await message.reply({ content: "An error occured running this command", ephemeral: true });
                    } catch (e) {
                        
                    }
                }
            }
        }
    }

    /**
     * Runs when a user's voice state changes. See discord.js documentation for more information.
     * 
     * @param oldState Old voice state
     * @param newState New voice state
     */
    public async onUserVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) { }

    /**
     * @beta
     * Gets a user by its id. This will eventually be renamed to `getUser` probably.
     * 
     * @param id User id
     */
    public getUserV2(id: string, guild: string = ""): TUser { throw new Error("Get user is undefined"); };

    /**
     * Runs right before the application quits.
     */
    public async onClose() {

    }

    /**
     * Refreshes commands for all servers.
     * 
     * It is recommended to hook this up to a command.
     * @example
     * ```ts
     * export default class RefreshCommand<TUser, TBot<TUser>> extends Command<TUser, TBot<TUser>> {
     *      public getName() { return "refresh"; }
     *
     *      public create() {
     *          return new SlashCommandBuilder()
     *              .setName(this.getName())
     *              .setDescription("Refresh commands")
     *              .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);
     *      }
     *
     *      public async execute(msg: ChatInputCommandInteraction<CacheType>) {
     *          await msg.deferReply();
     *          await this.bot.refreshCommands();
     *          await msg.editReply("Refreshed commands");
     *      }
     * }
     * ```
     */
    public async refreshCommands() {
        const guildCmds: CommandBuilderTypes[] = [];
        const globalCmds: CommandBuilderTypes[] = [];

        this.commands.forEach(i => {
            if (i.guildCommand()) guildCmds.push(i.create());
            if (i.globalCommand()) globalCmds.push(i.create());
        });

        await this.client.application.commands.set(globalCmds);

        this.client.guilds.cache.forEach(async i => {
            await i.commands.set(guildCmds);
        });

        this.log.info("Refreshed all commands");
    }

    /**
     * Gets a channel by id.
     * 
     * @param id Channel id
     * @returns Channel
     */
    public getChannel<T extends GuildBasedChannel = TextChannel>(id: string): T {
        for (const i of this.client.guilds.cache.values()) {
            var ret = i.channels.cache.get(id) as T;
            if (ret !== undefined) {
                return ret;
            }
        }

        throw new Error("Unable to find channel with id " + id);
    }

    /**
     * Checks to see if a user is in any of the servers this bot is in.
     * 
     * @remarks
     * It is recommended to only use this if this bot is only in one server.
     * 
     * @param id User id
     * @returns If the user is in a server
     */
    public userExists(id: string) {
        for (const i of this.client.guilds.cache.values()) {
            if (i.members.cache.has(id)) return true;
        }

        return false;
    }

    /**
     * Gets a role by an id.
     * 
     * @param id Role id
     * @returns Role
     */
    public getRole(id: string): Role {
        for (const i of this.client.guilds.cache.values()) {
            if (i.roles.cache.has(id)) {
                return i.roles.cache.get(id);
            }
        }

        throw new Error("Unable to find role with id " + id);
    }
}
