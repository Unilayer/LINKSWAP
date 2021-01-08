import { Contract, providers, utils, BigNumber } from 'ethers';
import { ReplaySubject } from 'rxjs';
import { IOrder, EOrderStatus, EOrderType } from '../models';
import { ICoin } from '../models/coin.interface';
import * as abiLimit from '../../../abis/limit.abi.json';
import * as abiErc20 from '../../../abis/erc20.abi.json';

export class LimitContract {

  private readContract: Contract;

  public readonly eventCreated  = new ReplaySubject<IOrder>(1);
  public readonly eventExecuted = new ReplaySubject<IOrder>(1);
  public readonly eventCanceld  = new ReplaySubject<IOrder>(1);

  public feeStake: number = 0;
  public feeExecutor: number = 0;

  constructor(private readonly coins: ICoin[], infuraProvider: providers.InfuraProvider) {
    this.readContract = new Contract('0xfa311750a0e1d2b8b979678ec1a04f56ac8db866', abiLimit.obj, infuraProvider);
  }

  async onInit() {
    const data = await Promise.all([
      this.readContract.STAKE_FEE.call(),
      this.readContract.EXECUTOR_FEE.call()
    ]);
    this.feeStake    = data[0];
    this.feeExecutor = data[1];

    this.readContract.on('0x9fdc338d1bfe2f2f0ae25a02b5bdcd2466b63dedaf221055ad4c2f8bf80107cb', async (...event) => {
      if (event) {
        const data = await this.parseEventCreate(event[event.length - 1].args);
        if (data) { this.eventCreated.next(data); }
      }
    });

    this.readContract.on('0x96887449736ea61232da74d556679628212a6418ae409f6b0f648a416b4e7b86', async (...event) => {
      if (event) {
        const data = await this.parseEvent(event[event.length - 1].args);
        if (data) { this.eventExecuted.next(data); }
      }
    });

    this.readContract.on('0xc54564d8bb24f7208de85ab88c9e3373a39a2813ec2954267e5feee6c83d6344', async (...event) => {
      if (event) {
        const data = await this.parseEvent(event[event.length - 1].args);
        if (data) { this.eventCanceld.next(data); }
      }
    });
  }

  async onDestroy() {
    this.readContract.removeAllListeners();
  }

  async findOrdersByAddress(address: string) {
    // total of orders
    const maxOrders = (await this.readContract.getOrdersForAddressLength(address)).toNumber();
    // find orders id from address
    let promisseOrders = [];
    for (let i = 0; i < maxOrders; i++) {
      promisseOrders.push(this.readContract.getOrderIdForAddress(address, i));
    }
    let data = await Promise.all(promisseOrders);
    // find orders by id
    promisseOrders = [];
    for (let i = 0; i < maxOrders; i++) {
      promisseOrders.push(this.readContract.orderBook(data[i]));
    }
    data = await Promise.all(promisseOrders);
    // list of orders
    const orders: IOrder[] = [];
    // for each order
    for await (let item of data) {
      const info = this.coins.filter(e => ((e.token.address == item.assetOut.toLowerCase()) || (e.token.address == item.assetIn.toLowerCase())));

      if (info.length > 0) {
        const order: IOrder = {
          id: item.id.toNumber(),
          nameA: '',
          nameB: '',
          tokenA: '',
          tokenB: '',
          amountA: 0,
          amountB: 0,
          price: 0,
          type: item.orderType,
          state: item.orderState,
          status: EOrderStatus.SUCCESS,
          address: item.traderAddress
        }

        if (order.type == EOrderType.BUY) { 
          order.nameA   = 'ETH';
          order.nameB   = info[0].token.symbol;
          order.tokenA  = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
          order.tokenB  = info[0].token.address;
          order.amountA = parseFloat(utils.formatUnits(item.assetInOffered, 18));
          order.amountB = parseFloat(utils.formatUnits(item.assetOutExpected, info[0].token.decimals));
          order.price = ((+order.amountB) / (+order.amountA));          
        } else {
          order.nameA   = info[0].token.symbol;
          order.nameB   = 'ETH';
          order.tokenA  = info[0].token.address;
          order.tokenB  = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
          order.amountA = parseFloat(utils.formatUnits(item.assetInOffered, info[0].token.decimals));
          order.amountB = parseFloat(utils.formatUnits(item.assetOutExpected, 18));
          order.price = ((+order.amountA) / (+order.amountB));
        }

        orders.push(order);
      }
    }

    return orders;
  }

  async findOrderByIndex(index: number, symbol: string, decimals: number): Promise<IOrder> {
    const orderId: BigNumber = await this.readContract.orders(index);
    const order = await this.readContract.orderBook(orderId);

    const data: IOrder = {
      id: order.id.toNumber(),
      nameA: '',
      nameB: '',
      tokenA: order.assetIn,
      tokenB: order.assetOut,
      amountA: 0,
      amountB: 0,
      price: 0,
      type: order.orderType,
      state: order.orderState,
      status: EOrderStatus.SUCCESS,
      address: order.traderAddress
    }

    if (data.type == EOrderType.BUY) { 
      data.nameA   = 'ETH';
      data.nameB   = symbol;
      data.amountA = parseFloat(utils.formatUnits(order.assetInOffered, 18));
      data.amountB = parseFloat(utils.formatUnits(order.assetOutExpected, decimals));

      data.price = ((+data.amountA) / (+data.amountB));
    } else {
      data.nameA   = symbol;
      data.nameB   = 'ETH';
      data.amountA = parseFloat(utils.formatUnits(order.assetOutExpected, decimals));
      data.amountB = parseFloat(utils.formatUnits(order.assetInOffered, 18));

      data.price = ((+data.amountB) / (+data.amountA));
    }
    
    return data;
  }

  async findOpenOrders(symbol: string, decimals: number) {
    const ordersLength: BigNumber = await this.readContract.getOrdersLength();

    const promisseOrders = [];

    for (let i = 0; i < ordersLength.toNumber(); i++) {
      promisseOrders.push(this.findOrderByIndex(i, symbol, decimals));
    }

    return (await Promise.all<IOrder>(promisseOrders));
  }

  private async parseEvent(data: any) {
    // const info = await this.coins.filter(e => ((e.token?.address == data.assetIn.toLowerCase()) || (e.token?.address.toLowerCase())));
    // if (info.length > 0) {
      return <IOrder>{ 
        id: data.id.toNumber(),
        address: data?.traderAddress
      };
    // }
  }

  private async parseEventCreate(data: any) {
    const info = await this.coins.filter(e => ((e?.token?.address == data.assetIn.toLowerCase()) || (e?.token?.address == data.assetOut.toLowerCase())));

    if (info.length > 0) {
      const order: IOrder = {
        id: data.id.toNumber(),
        nameA: '',
        nameB: '',
        tokenA: '',
        tokenB: '',
        amountA: 0,
        amountB: 0,
        price: 0,
        type: data?.orderType,
        state: data?.orderState,
        status: EOrderStatus.SUCCESS,
        address: data?.traderAddress
      }
  
      if (order.type == EOrderType.BUY) {
        order.nameA   = 'ETH';
        order.nameB   = data.assetIn;
        order.tokenA  = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
        order.tokenB  = info[0]?.token?.address || '';
        order.amountA = parseFloat(utils.formatUnits(data.assetInOffered, 18));
        order.amountB = parseFloat(utils.formatUnits(data.assetOutExpected, info[0]?.token?.decimals));
  
        order.price = ((+order.amountA) / (+order.amountB));
      } else {
        order.nameA   = info[0]?.token?.symbol || '';
        order.nameB   = 'ETH';
        order.tokenA  = info[0]?.token?.address || '';
        order.tokenB  = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
        order.amountA = parseFloat(utils.formatUnits(data.assetInOffered, info[0]?.token?.decimals));
        order.amountB = parseFloat(utils.formatUnits(data.assetOutExpected, 18));
  
        order.price = ((+order.amountB) / (+order.amountA));
      }
  
      return order;
    }

    return null;
  }
  
  async approve(tokenAddress: string, amount: number, provider: providers.Web3Provider | null) {
    if (provider == null) { return };

    const tokenContract = new Contract(tokenAddress, abiErc20.obj, provider.getSigner());
    const approve = await tokenContract.approve('0xfa311750a0e1d2b8b979678ec1a04f56ac8db866', amount);
    await provider.waitForTransaction(approve.hash, 1);
  }

  async buy(token: string, decimals: number, amountIn: number, amountOut: number, gasPrice: number, provider: providers.Web3Provider | null) {
    if (provider == null) { return; };

    // create contract
    const contract = new Contract('0xfa311750a0e1d2b8b979678ec1a04f56ac8db866', abiLimit.obj, provider.getSigner());
    // tokens
    const tokenAFn = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
    const tokenBFn = token;
    // amounts
    const amountInFn = utils.parseUnits(amountIn.toString(), 18);
    const amountOutFn = utils.parseUnits(amountOut.toString(), decimals);
    // payment
    const value = amountInFn.add(amountInFn.mul(this.feeStake).div(1000)).add(this.feeExecutor);
    // configs
    const gaslimitFn = await contract.estimateGas.createOrder(0, tokenAFn, tokenBFn, amountInFn, amountOutFn, this.feeExecutor, { value: value, gasPrice: BigNumber.from(gasPrice), gasLimit: BigNumber.from(330000) });
    // call contract
    const tx = await contract.createOrder(0, tokenAFn, tokenBFn, amountInFn, amountOutFn, this.feeExecutor, { value: value, gasPrice: gasPrice, gasLimit: gaslimitFn });
    // wait confirmation
    const txResponse = await provider.waitForTransaction(tx.hash, 1);
    // parse response based on functions params
    const r = utils.defaultAbiCoder.decode(
      ['uint256', 'uint8', 'uint8', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256'],
      txResponse.logs[0].data
    );
    // return id
    return r[0].toNumber();
  }

  async sell(token: string, decimals: number, amountIn: number, amountOut: number, gasPrice: number, provider: providers.Web3Provider | null) {
    if (provider == null) { return };

    // create contract
    const contract = new Contract('0xfa311750a0e1d2b8b979678ec1a04f56ac8db866', abiLimit.obj, provider.getSigner());
    // tokens
    const tokenAFn = token; //(environment.production) ? token : environment.token.LAYER;
    const tokenBFn = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
    // amounts
    const amountInFn = utils.parseUnits(amountIn.toString(), decimals);
    const amountOutFn = utils.parseUnits(amountOut.toString(), 18);
    // estimate gas
    const gaslimitFn = await contract.estimateGas.createOrder(1, tokenAFn, tokenBFn, amountInFn, amountOutFn, this.feeExecutor, { value: this.feeExecutor, gasPrice: gasPrice });
    // call contract
    const tx = await contract.createOrder(1, tokenAFn, tokenBFn, amountInFn, amountOutFn, this.feeExecutor, { value: this.feeExecutor, gasPrice: gasPrice, gasLimit: gaslimitFn });
    // wait confirmation
    const t = await provider.waitForTransaction(tx.hash, 1);

    const r = utils.defaultAbiCoder.decode(
      ['uint256', 'uint8', 'uint8', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256'],
      t.logs[1].data
    );

    return r[0].toNumber();
  }

  async cancel(id: number, gasPrice: number, provider: providers.Web3Provider | null) {
    if (provider == null) { return };
    
    // estimate gas
    const contract = new Contract('0xfa311750a0e1d2b8b979678ec1a04f56ac8db866', abiLimit.obj, provider.getSigner());
    // estimate gas
    const gasLimit = await contract.estimateGas.cancelOrder(id, { value: BigNumber.from(0), gasPrice: gasPrice });
    // call contract
    const tx = await contract.cancelOrder(id, { value: BigNumber.from(0), gasPrice: gasPrice, gasLimit: gasLimit });
    // wait confirmation
    await provider.waitForTransaction(tx.hash, 1);
  }

}