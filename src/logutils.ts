import { LOG_CONFIG } from "./bot.js";

/**
 * A utility class for logging support.
 */
export class Loggable {
    public readonly log = LOG_CONFIG.DEFAULT_LOGGER.getSubLogger({ name: this.constructor.name });
}
