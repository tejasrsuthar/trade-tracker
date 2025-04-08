/**
 * Enum representing different types of trades
 */
export enum TradeType {
  Initial = "Initial",
  FreeRoll = "Free Roll",
  Reduced = "Reduced",
  Added = "Added",
}

/**
 * Enum representing trade size categories with risk percentages
 */
export enum TradeSize {
  Qtr = "Qtr 6.25%",
  Half = "Half 12.50%",
  Full = "Full 25%",
  Double = "2X Full 50%",
}

/**
 * Interface representing an active/live trade
 * @property {string} id - Unique identifier for the trade
 * @property {string} accountId - Associated trading account ID
 * @property {string} symbol - Trading symbol/ticker
 * @property {number} entryPrice - Entry price of the trade
 * @property {TradeType} tradeType - Type of trade (Initial/FreeRoll/Reduced/Added)
 * @property {TradeSize} size - Size category of the trade
 * @property {number} qty - Quantity of units traded
 * @property {number} slPercentage - Stop loss percentage
 * @property {Date} entryDate - Date and time when trade was entered
 */
export interface LiveTrade {
  id: string;
  accountId: string;
  symbol: string;
  entryPrice: number;
  tradeType: TradeType;
  size: TradeSize;
  qty: number;
  slPercentage: number;
  entryDate: Date;
}

/**
 * Interface representing a completed/closed trade
 * @property {string} id - Unique identifier for the trade
 * @property {string} accountId - Associated trading account ID
 * @property {string} symbol - Trading symbol/ticker
 * @property {number} entryPrice - Entry price of the trade
 * @property {number} exitPrice - Exit price of the trade
 * @property {TradeType} tradeType - Type of trade (Initial/FreeRoll/Reduced/Added)
 * @property {TradeSize} size - Size category of the trade
 * @property {number} qty - Quantity of units traded
 * @property {Date} entryDate - Date and time when trade was entered
 * @property {Date} exitDate - Date and time when trade was closed
 * @property {number} [fees] - Optional trading fees
 * @property {number} realizedPL - Realized profit/loss from the trade
 */
export interface ClosedTrade {
  id: string;
  accountId: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  tradeType: TradeType;
  size: TradeSize;
  qty: number;
  entryDate: Date;
  exitDate: Date;
  fees?: number;
  realizedPL: number;
}

/**
 * Interface representing a trading account
 * @property {string} id - Unique identifier for the account
 * @property {string} name - Account name
 * @property {number} startingBalance - Initial account balance
 */
export interface Account {
  id: string;
  name: string;
  startingBalance: number;
}