import { ProviderType } from '@masknet/web3-shared-evm'
import type { Context, Middleware } from '../types'
import { MaskWallet } from '../interceptors/MaskWallet'
import { Injected } from '../interceptors/Injected'
import { WalletConnect } from '../interceptors/WalletConnect'

export class Interceptor implements Middleware<Context> {
    private interceptors: Partial<Record<ProviderType, Middleware<Context>>> = {
        [ProviderType.MaskWallet]: new MaskWallet(),
        [ProviderType.MetaMask]: new Injected(ProviderType.MetaMask),
        [ProviderType.Coin98]: new Injected(ProviderType.Coin98),
        [ProviderType.WalletConnect]: new WalletConnect(),
    }

    async fn(context: Context, next: () => Promise<void>) {
        if (context.writeable) await this.interceptors[context.providerType]?.fn(context, next)
        else await next()
    }
}
