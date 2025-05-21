import { Command } from "./command.js";
import { CacheType, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import "reflect-metadata";
import { Bot } from "./bot.js";
import { getFunctionArgs } from "./utils.js";

export interface SuperCommandArg {
    index: number;
    name: string;
    description: string;
    required: boolean;
    type: any;

    min?: number;
    max?: number;
}

export interface SuperCommandRoute {
    name: string;
    description: string;
    args: SuperCommandArg[];
    func: Function;
}

const argsKey = Symbol("args");
export function param(description: string, required: boolean = true) {
    return (target: any, propertyKey: string | symbol, parameterIndex: number) => {
        var argData: SuperCommandArg[] = Reflect.getOwnMetadata(argsKey, target, propertyKey) || [];
        const args = getFunctionArgs(target[propertyKey] as Function);
        argData.push({ index: parameterIndex, description, required, name: args[parameterIndex], type: Reflect.getMetadata("design:paramtypes", target, propertyKey)[parameterIndex] });
        Reflect.defineMetadata(argsKey, argData, target, propertyKey);
    };
}

export function numberParam(description: string, min: number, max: number, required: boolean = true) {
    return (target: any, propertyKey: string | symbol, parameterIndex: number) => {
        var argData: SuperCommandArg[] = Reflect.getOwnMetadata(argsKey, target, propertyKey) || [];
        const args = getFunctionArgs(target[propertyKey] as Function);
        if (Reflect.getMetadata("design:paramtypes", target, propertyKey)[parameterIndex] != Number) throw new TypeError("Argument is not of type number");
        argData.push({ index: parameterIndex, description, required, name: args[parameterIndex], type: Number, min, max });
        Reflect.defineMetadata(argsKey, argData, target, propertyKey);
    };
}

const routeKey = Symbol("routes")
export function cmd<T extends Function>(description: string) {
    return (target: Object, propertyName: string, descriptor: TypedPropertyDescriptor<T>) => {
        var method = descriptor.value!;

        var argData: SuperCommandArg[] = Reflect.getOwnMetadata(argsKey, target, propertyName) || [];

        if (argData.length + 1 != getFunctionArgs((target as any)[propertyName] as Function).length) throw new Error(`Command route for ${target.constructor.name} has mismatching number of arguments`);
        argData.reverse();
        var routes: SuperCommandRoute[] = Reflect.getOwnMetadata(routeKey, target) || [];
        routes.push({ args: argData, func: method, name: propertyName, description });
        Reflect.defineMetadata(routeKey, routes, target);

        // @ts-expect-error
        descriptor.value = function () {
            return method.apply(this, arguments);
        }
    }
}

/**
 * Another way to create commands.
 * 
 * @alpha
 */
export abstract class SuperCommand<T extends Bot<any>, TUser = T extends Bot<infer U> ? U : never, TBot extends Bot<TUser> = T> extends Command<TBot> {
    private cmdBuilder: SlashCommandBuilder;
    protected caller: TUser;

    public routes: SuperCommandRoute[] = [];

    public abstract get description(): string;
    public abstract get modOnly(): boolean;

    constructor(bot: TBot) {
        super(bot);
        this.routes = Reflect.getMetadata(routeKey, this) || []
    }

    public createRoute<T extends SlashCommandBuilder | SlashCommandSubcommandBuilder>(cmd: T, route: SuperCommandRoute) {
        for (const i of route.args) {
            if (i.type === String) {
                cmd.addStringOption(opt => opt.setName(i.name).setDescription(i.description).setRequired(i.required));
            } else if (i.type === Number) {
                cmd.addNumberOption(opt => opt.setName(i.name).setDescription(i.description).setRequired(i.required).setMinValue(i.min).setMaxValue(i.max));
            } else {
                cmd.addUserOption(opt => opt.setName(i.name).setDescription(i.description).setRequired(i.required));
            }
        }
        return cmd;
    }

    public create() {
        if (this.cmdBuilder === undefined) {
            this.cmdBuilder = new SlashCommandBuilder()
                .setName(this.getName())
                .setDescription(this.description);

            for (const i of this.routes) {
                if (i.name === "default") {
                    this.createRoute(this.cmdBuilder, i);
                } else {
                    this.cmdBuilder.addSubcommand(cmd => {
                        cmd.setName(i.name);
                        cmd.setDescription(i.description);
                        return this.createRoute(cmd, i);
                    });
                }
            }

            if (this.modOnly) this.cmdBuilder.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);
        }

        return this.cmdBuilder;
    }

    public async execute(msg: ChatInputCommandInteraction<CacheType>) {
        var subcmd = msg.options.getSubcommand(false) || "default";

        const route = this.routes.find(i => i.name === subcmd);
        if (route) {
            this.caller = this.bot.getUserV2(msg.user.id, msg.guildId);
            await route.func.call(this, msg, ...this.processArgs(msg, route.args));
        }
    }

    private processArgs(msg: ChatInputCommandInteraction<CacheType>, args: SuperCommandArg[]) {
        var out: any[] = [];

        for (const i of args) {
            if (i.type === String) {
                out.push(msg.options.getString(i.name, i.required));
            } else if (i.type === Number) {
                out.push(msg.options.getNumber(i.name, i.required));
            } else {
                var user = msg.options.getUser(i.name, i.required);
                if (user) out.push(this.bot.getUserV2(user.id, msg.guildId));
                else out.push(null);
            }
        }

        return out;
    }
}
