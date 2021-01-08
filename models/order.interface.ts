import { EOrderType } from './order-type.enum';
import { EOrderState } from './order-state.enum';
import { EOrderStatus } from './order-status.enum';

export interface IOrder {

  id: number

  nameA: string;

  nameB: string;

  tokenA: string;

  tokenB: string;

  amountA: number;

  amountB: number;

  price: number;

  type: EOrderType;

  state: EOrderState;

  status: EOrderStatus;

  message?: string;

  address: string;

}