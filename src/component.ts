import { type Awaitable, ClientEvents, Events, GuildEmoji, GuildMember, Message, MessageReaction, type PartialGuildMember, type PartialMessage, type PartialMessageReaction, type PartialUser, User } from "discord.js";
import "reflect-metadata";
import { Bot } from "./bot.js";
import { Loggable } from "./logutils.js";

const typeKey = Symbol("type");

/**
 * Decorator for events the component should listen to.
 * 
 * @param type Event
 */
export function name(type: Events) {
    return Reflect.metadata(typeKey, type);
}

/**
 * Adds functionality to bots.
 */
export abstract class Component<T extends Bot<any>, TUser = T extends Bot<infer U> ? U : never, TBot extends Bot<TUser> = T> extends Loggable {
    public readonly bot!: TBot;

    /**
     * Sets up the component.
     */
    public setup(bot: TBot) {
        (this as any)["bot"] = bot;

        const proto = Object.getPrototypeOf(this);

        for (const i of Object.getOwnPropertyNames(proto) as (keyof Component<T>)[]) {
            const event: keyof ClientEvents = Reflect.getMetadata(typeKey, this, i);

            var obj = this[i];
            if (event !== undefined && typeof obj === "function") {
                this.bot.client.on(event, obj.bind(this) as any);
            }
        }
    }

    /**
     * Called on bot login.
     */
    public onLogin(): Awaitable<void> { };

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
