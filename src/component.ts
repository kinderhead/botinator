import { Awaitable, ClientEvents, Events, GuildEmoji, GuildMember, Message, MessageReaction, PartialGuildMember, PartialMessage, PartialMessageReaction, PartialUser, User } from "discord.js";
import "reflect-metadata";
import { Bot } from "./bot.js";
import { Loggable } from "./logutils.js";

const typeKey = Symbol("type");
export function name(type: Events) {
    return Reflect.metadata(typeKey, type);
}

export abstract class Component<TUser, TBot extends Bot<TUser>> extends Loggable {
    public readonly bot: TBot;

    public constructor(bot: TBot) {
        super();

        this.bot = bot;

        const proto = Object.getPrototypeOf(this);

        for (const i of Object.getOwnPropertyNames(proto) as (keyof Component<TUser, TBot>)[]) {
            const event: keyof ClientEvents = Reflect.getMetadata(typeKey, this, i);

            var obj = this[i];
            if (event !== undefined && typeof obj === "function") {
                this.bot.client.on(event, obj.bind(this) as any);
            }
        }
    }

    public async refreshDatamaps() { };

    public init(): Awaitable<void> { };

    @name(Events.MessageCreate)
    public onMessage(msg: Message): Awaitable<void> { };

    @name(Events.MessageUpdate)
    public onMessageEdit(old: Message | PartialMessage, edited: Message | PartialMessage): Awaitable<void> { };

    @name(Events.MessageDelete)
    public onMessageDelete(msg: Message): Awaitable<void> { };

    @name(Events.GuildMemberAdd)
    public onJoin(user: GuildMember): Awaitable<void> { };

    @name(Events.GuildMemberRemove)
    public onLeave(user: GuildMember | PartialGuildMember): Awaitable<void> { };

    @name(Events.MessageReactionAdd)
    public onReaction(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Awaitable<void> { };

    @name(Events.MessageReactionRemove)
    public onReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Awaitable<void> { };

    @name(Events.GuildEmojiUpdate)
    public onEmojiUpdate(oldEmoji: GuildEmoji, newEmoji: GuildEmoji): Awaitable<void> { };
}
