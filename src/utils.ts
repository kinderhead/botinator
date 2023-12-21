import { TextInputBuilder } from "@discordjs/builders";
import { diffChars } from "diff";
import { APIEmbed, APIEmbedField, APIModalInteractionResponseCallbackData, ActionRowBuilder, AnyComponentBuilder, AutocompleteInteraction, AwaitModalSubmitOptions, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, ComponentType, EmbedBuilder, GuildMember, InteractionReplyOptions, InteractionResponse, JSONEncodable, Message, MessagePayload, ModalActionRowComponentBuilder, ModalBuilder, ModalComponentData, ModalSubmitInteraction, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder, TextInputStyle, WebhookMessageEditOptions } from "discord.js";
import { LOG_CONFIG } from "./bot.js";

export function discordDiff(a: string, b: string) {
    a = a || "";
    b = b || "";
    var diff = diffChars(escapeMarkdown(a), escapeMarkdown(b));
    var res = "";

    for (const i of diff) {
        if (i.added) {
            res += `**${i.value}**`;
        } else if (i.removed) {
            res += `~~${i.value}~~`;
        } else {
            res += i.value;
        }
    }

    return res;
}

export async function expandAndHandleEmbed(base: EmbedBuilder, fields: APIEmbedField[], chunkSize: number, msg: InteractionSendable) {
    const pages = [];

    for (let i = 0; i < fields.length; i += chunkSize) {
        const chunk = fields.slice(i, i + chunkSize);

        pages.push(EmbedBuilder.from(base.toJSON()).addFields(chunk));
    }

    await embedPager(pages, msg);
}

// https://stackoverflow.com/questions/39542872/escaping-discord-subset-of-markdown
export function escapeMarkdown(text: string) {
    var unescaped = text.replace(/\\(\*|_|`|~|\\)/g, '$1');
    var escaped = unescaped.replace(/(\*|_|`|~|\\)/g, '\\$1');
    return escaped;
}

export async function embedPager(pages: EmbedBuilder[], msg: InteractionSendable, ephemeral: boolean = false, content: string = "", additionalButtons: ButtonBuilder[] = [], callbacks: { [name: string]: (page: number, interaction: ButtonInteraction) => boolean | Promise<boolean> } = {}) {
    var pageIndex = 0;

    var nextId = createCustomId();
    var prevId = createCustomId();

    const next = new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel("Next")
        .setStyle(ButtonStyle.Primary);

    const previous = new ButtonBuilder()
        .setCustomId(prevId)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>();

    if (pages.length >= 2) {
        row.addComponents(previous, next);
    }

    row.addComponents(...additionalButtons);

    var reply: InteractionResponse | Message;

    if (pages.length == 0) {
        reply = await msg({ content: content, components: row.data.components == undefined ? [] : [row], ephemeral: ephemeral });
    } else {
        reply = await msg({ content: content, embeds: [pages[0]], components: row.components.length > 0 ? [row] : [], ephemeral: ephemeral });
    }

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

    await new Promise<void>(res => {
        collector.on("collect", async i => {
            if (i.customId == nextId) pageIndex++;
            else if (i.customId == prevId) pageIndex--;
            else if (i.customId in callbacks) {
                if (await callbacks[i.customId](pageIndex, i)) {
                    collector.stop();
                    return;
                }
            }

            if (pages.length != 0) {
                pageIndex = ((pageIndex % pages.length) + pages.length) % pages.length;

                if (i.replied) {
                    i.editReply({ embeds: [pages[pageIndex]], components: [row] });
                } else {
                    i.update({ embeds: [pages[pageIndex]], components: [row] });
                }
            }
        });

        collector.on("end", async i => {
            try {
                if (pages.length != 0) {
                    await reply.edit({ embeds: [pages[pageIndex]] });
                }
            } catch {

            }

            res();
        });
    });
}

export type SettingsArgType<T> = { default: T, name: string, desc: string, on_change: (i: T) => void | Promise<void | any> };
export async function settingsHelper(user: GuildMember, msg: InteractionSendable, embed: EmbedBuilder, options: (SettingsArgType<boolean> | SettingsArgType<string>)[], ephemeral: boolean = true) {
    var custom = createCustomId();
    var doneId = createCustomId();

    var int: ButtonInteraction = undefined;
    var message: InteractionResponse | Message = undefined;

    while (true) {
        embed.setFields(...options.map(i => {
            if (typeof i.default === "boolean") {
                return { name: i.name + ": " + i.default, value: i.desc, inline: true };
            } else if (typeof i.default === "string") {
                return { name: i.name, value: i.default, inline: true };
            }
        }));

        var row = quickActionRow(...options.map(i => {
            if (typeof i.default === "boolean") {
                return new ButtonBuilder().setCustomId(custom + i.name).setLabel(`Toggle ${i.name.toLowerCase()}`).setStyle(i.default ? ButtonStyle.Success : ButtonStyle.Danger);
            } else if (typeof i.default === "string") {
                return new ButtonBuilder().setCustomId(custom + i.name).setLabel(`Set ${i.name.toLowerCase()}`).setStyle(ButtonStyle.Primary);
            }
        }));

        row.addComponents(new ButtonBuilder().setCustomId(doneId).setLabel("Done").setStyle(ButtonStyle.Secondary));

        if (int === undefined) {
            message = await msg({ embeds: [embed], components: [row], ephemeral: true });
        } else if (!int.replied) {
            message = await int.update({ embeds: [embed], components: [row] });
        } else {
            message = await int.editReply({ embeds: [embed], components: [row] });
        }

        try {
            int = await message.awaitMessageComponent({ filter: i => i.user.id === user.id && (i.customId === doneId || options.map(i => custom + i.name).includes(i.customId)), componentType: ComponentType.Button });
        } catch (e) {
            LOG_CONFIG.DEFAULT_LOGGER.error(e);
            await message.edit({ embeds: [embed], components: [] });
            return;
        }

        if (int.customId === doneId) {
            await int.update({ embeds: [embed], components: [] });
            return;
        }

        for (const i of options) {
            if (int.customId === custom + i.name) {
                if (typeof i.default === "boolean") {
                    i.default = !i.default;
                    await i.on_change(i.default);
                } else if (typeof i.default === "string") {
                    i.default = await quickModal(`Set ${i.name.toLowerCase()}`, "Value", i.default, TextInputStyle.Paragraph, int);
                    await i.on_change(i.default);
                }

                break;
            }
        }
    }
}

export async function quickModal(title: string, label: string, def: string, style: TextInputStyle, int: { showModal: (modal: APIModalInteractionResponseCallbackData | ModalComponentData | JSONEncodable<APIModalInteractionResponseCallbackData>) => Promise<void>, awaitModalSubmit: (options: AwaitModalSubmitOptions<ModalSubmitInteraction<CacheType>>) => Promise<ModalSubmitInteraction<CacheType>> }, max: number = 4000) {
    //var placeholder = shorten(def);

    try {
        var modalId = createCustomId();
        var id = createCustomId();
        const modal = new ModalBuilder().setTitle(title).setCustomId(modalId).addComponents(
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setValue(def).setStyle(style).setMaxLength(max).setRequired(false))
        );

        await int.showModal(modal);

        const res = await int.awaitModalSubmit({ time: 36000000, filter: i => i.customId === modalId });
        res.deferReply().then(i => i.delete());

        const str = res.fields.getTextInputValue(id);
        return str === "" ? def : str;
    } catch (e) {
        console.error(e);
        return def;
    }
}

export async function quickMultiModal(title: string, label1: string, def1: string, label2: string, def2: string, int: { showModal: (modal: APIModalInteractionResponseCallbackData | ModalComponentData | JSONEncodable<APIModalInteractionResponseCallbackData>) => Promise<void>, awaitModalSubmit: (options: AwaitModalSubmitOptions<ModalSubmitInteraction<CacheType>>) => Promise<ModalSubmitInteraction<CacheType>> }, max1: number = 4000, max2: number = 4000): Promise<[string, string]> {
    try {
        //var placeholder1 = shorten(def1);
        //var placeholder2 = shorten(def2);

        var modalId = createCustomId();
        var id1 = createCustomId();
        var id2 = createCustomId();
        const modal = new ModalBuilder().setTitle(title).setCustomId(modalId).addComponents(
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                new TextInputBuilder().setCustomId(id1).setLabel(label1).setValue(def1).setStyle(TextInputStyle.Short).setMaxLength(max1).setRequired(false)
            ),
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                new TextInputBuilder().setCustomId(id2).setLabel(label2).setValue(def2).setStyle(TextInputStyle.Paragraph).setMaxLength(max2).setRequired(false)
            )
        );

        await int.showModal(modal);

        const res = await int.awaitModalSubmit({ time: 36000000, filter: i => i.customId === modalId });
        res.deferReply().then(i => i.delete());

        const str1 = res.fields.getTextInputValue(id1);
        const str2 = res.fields.getTextInputValue(id2);
        return [str1 === "" ? def1 : str1, str2 === "" ? def2 : str2];
    } catch (e) {
        console.error(e);
        return [def1, def2];
    }
}

export type ButtonHelperCallback<T> = (int: ButtonInteraction) => T | Promise<T>;
export async function buttonHelper<T = void>(base: EmbedBuilder, buttons: ([QuickButton, ButtonHelperCallback<T>])[], msg: InteractionSendable, ephemeral: boolean = true, allowedId: string = "") {
    const pages = [];
    const cbmap: { [id: string]: ButtonHelperCallback<T> } = {};

    for (let i = 0; i < buttons.length; i += 5) {
        const chunk = buttons.slice(i, i + 5);

        pages.push(quickActionRow(...chunk.map(i => {
            const id = createCustomId();
            cbmap[id] = i[1];
            return new ButtonBuilder().setLabel(i[0].label).setStyle(i[0].style).setCustomId(id);
        })));
    }

    const reply = await msg({ embeds: [base], components: pages, ephemeral: ephemeral });
    const choice = await reply.awaitMessageComponent({
        filter: i => {
            if (allowedId === "") {
                return i.customId in cbmap;
            } else {
                return i.customId in cbmap && i.user.id === allowedId;
            }
        }, componentType: ComponentType.Button
    });
    try {
        await reply.edit({ embeds: [base], components: [] });
    } catch {

    }
    return await cbmap[choice.customId](choice);
}

export type SelectHelperCallback<T> = (int: StringSelectMenuInteraction) => T | Promise<T>;
export async function selectHelper<T = void>(base: EmbedBuilder, options: { [opt: string]: SelectHelperCallback<T> }, msg: InteractionSendable, ephemeral: boolean = true) {
    const menuId = createCustomId();
    const menu = new StringSelectMenuBuilder()
        .setPlaceholder("Choose post")
        .setCustomId(menuId)
        .setOptions(Object.keys(options).map((i, idex) => new StringSelectMenuOptionBuilder().setLabel(shorten(i)).setValue(idex.toString())));

    const reply = await msg({ content: "", embeds: [base], components: [quickActionRow(menu)], ephemeral: ephemeral });
    const int = await reply.awaitMessageComponent({ filter: i => i.customId === menuId, componentType: ComponentType.StringSelect });
    try {
        await reply.edit({ embeds: [base], components: [] });
    } catch {

    }
    return await options[Object.keys(options)[parseInt(int.values[0])]](int);
}

export function quickActionRow<T extends AnyComponentBuilder>(...components: T[]) {
    return new ActionRowBuilder<T>().addComponents(components);
}

export function shorten(str: string, length: number = 100) {
    var short = str;
    if (short.length >= length) return short.substring(0, length - 3) + "...";
    return short;
}

export function isValidUrl(urlString: string) {
    var urlPattern = new RegExp('^(https?:\\/\\/)?' +
        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' +
        '((\\d{1,3}\\.){3}\\d{1,3}))' +
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
        '(\\?[;&a-z\\d%_.~+=-]*)?' +
        '(\\#[-a-z\\d_]*)?$', 'i');
    return !!urlPattern.test(urlString);
}

export async function autocompleteOptions(cmd: AutocompleteInteraction<CacheType>, choices: string[]) {
    const focusedValue = cmd.options.getFocused();
    const filtered = choices.filter(choice => choice.startsWith(focusedValue));

    await cmd.respond(
        filtered.map(choice => ({ name: choice, value: choice })),
    );
}

export function getNextDayOfWeek(date: Date, dayOfWeek: number) {
    date = new Date(date.getTime());
    date.setDate(date.getDate() + (dayOfWeek + 7 - date.getDay()) % 7);
    return date;
}

export function values<T>(obj: { [key: number | string]: T }) {
    var array: T[] = [];
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            array.push(obj[key]);
        }
    }

    return array;
}

// https://www.reddit.com/r/typescript/comments/sum16o/how_to_access_parameter_names_or_get_args_as_an/
export function getFunctionArgs(originalFunc: Function): null | string[] {
    const stringified: string = originalFunc.toString();

    const startBracket = stringified.indexOf('(');
    if (startBracket < 0) {
        return null;
    }

    const endBracket = stringified.indexOf(')', startBracket);
    if (endBracket < 0) {
        return null;
    }

    const paramsString = stringified.substring(startBracket + 1, endBracket);
    if (paramsString.length === 0) {
        return [];
    }

    const params = paramsString.split(',').map(e => e.trim());
    return params;
}

export var createCustomId = () => Math.random().toString();

export type InteractionSendable = (content: string | MessagePayload | InteractionReplyOptions) => Promise<InteractionResponse | Message>;

export interface QuickButton {
    label: string;
    style: ButtonStyle;
}
