import { Loggable } from "./logutils.js";

/**
 * An advanced data mapper.
 * 
 * @experimental
 */
export abstract class DataMapper<TBot, TOriginal extends { id: string | number }> extends Loggable {
    public bot: TBot;

    protected obj: TOriginal;
    protected shouldRefresh = true;
    protected timeSinceLastReload: Date;

    public constructor(bot: TBot, data: TOriginal, registry: { [key: string | number]: DataMapper<TBot, TOriginal> }) {
        if (registry.hasOwnProperty(data.id)) {
            throw new Error("This object already exists, and this makes me sad :(");
        }

        super();

        this.bot = bot;
        this.obj = data;

        this.timeSinceLastReload = new Date();

        var proxy = new Proxy(this, {
            get(target, prop) {
                var out = target[prop as keyof typeof target];
                if (target.shouldRefresh && typeof out != "function") target.checkForRefresh();
                if (target.obj.hasOwnProperty(prop)) {
                    return target.obj[prop as keyof typeof target.obj];
                }
                return out;
            },
            set(target, prop, value) {
                if (target.obj.hasOwnProperty(prop)) {
                    if (value == undefined) throw new Error("Tried to set value to undefined");

                    target.obj[prop as keyof typeof target.obj] = value;
                    target.set(prop as keyof typeof target.obj, value);
                } else {
                    if (value == undefined) console.trace(prop, value);
                    target[prop as keyof typeof target] = value;
                }
                return true;
            }
        });

        registry[data.id] = proxy;

        return proxy;
    }

    public abstract refresh(): Promise<void>;
    public abstract reload(): Promise<void>;
    protected abstract set<TKey extends keyof TOriginal>(name: TKey, value: TOriginal[TKey]): void;

    public withoutRefresh<T>(func: (obj: this) => T): T {
        this.shouldRefresh = false;
        var res: T;

        try {
            res = func(this);
        } finally {
            this.shouldRefresh = true;
        }

        return res;
    }

    protected async checkForRefresh() {
        if (Date.now() > this.timeSinceLastReload.getTime() + (60 * 60000)) {
            this.timeSinceLastReload = new Date();
            //this.log.debug("Refreshing a " + this.constructor.name + " with id " + this.obj.id);
            await this.reload();
        }
    }

    protected fetchArrayFactory<T, TBase extends { id: string | number }>(data: TBase[], factory: new (bot: TBot, data: TBase) => T, registry: { [key: string | number]: T }) {
        var res: T[] = [];
        for (const i of data) {
            if (registry.hasOwnProperty(i.id)) res.push(registry[i.id])
            else res.push(new factory(this.bot, i));
        }
        return res;
    }

    protected fetchFactory<T, TBase extends { id: string | number }>(data: TBase, factory: new (bot: TBot, data: TBase) => T, registry: { [key: string | number]: T }) {
        if (registry.hasOwnProperty(data.id)) return registry[data.id];
        else return new factory(this.bot, data);
    }
}
