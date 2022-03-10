import { useEffect, useCallback, useMemo } from 'react'
import { useMount } from 'react-use'
import type { ProviderType, ChainId } from '@masknet/web3-shared-evm'
import { NetworkPluginID, useChainId, useProviderType } from '@masknet/plugin-infra'
import { isDashboardPage, isPopupPage } from '@masknet/shared-base'
import { EVM_Messages } from '../../messages'
import Services from '../../../../extension/service'
import { WalletRPC } from '../../../Wallet/messages'
import { useBridgedProvider } from '../../hooks'

export interface InjectedProviderBridgeProps {
    type: ProviderType
}

export function InjectedProviderBridge({ type }: InjectedProviderBridgeProps) {
    const chainId = useChainId<ChainId>(NetworkPluginID.PLUGIN_EVM)
    const providerType = useProviderType<ProviderType>(NetworkPluginID.PLUGIN_EVM)
    const bridgedProvider = useBridgedProvider(type)
    const isContextMatched = useMemo(() => {
        if (isDashboardPage() || isPopupPage()) return false
        return true
    }, [])

    const onMounted = useCallback(async () => {
        if (!isContextMatched || type !== providerType) return
        const connected = await Services.Ethereum.connect({
            providerType,
        })
        await WalletRPC.updateAccount({
            account: connected.account,
            chainId: connected.chainId,
            providerType,
        })
    }, [chainId, providerType, isContextMatched])

    useEffect(() => {
        return EVM_Messages.events.INJECTED_PROVIDER_RPC_REQUEST.on(async ({ providerType: actualType, payload }) => {
            console.log('DEBUG: INJECTED_PROVIDER_RPC_REQUEST')
            console.log({
                actualType,
                payload,
            })

            if (type !== actualType || !isContextMatched) return
            try {
                const result = await bridgedProvider.request({
                    method: payload.method,
                    params: payload.params,
                })
                EVM_Messages.events.INJECTED_PROVIDER_RPC_RESPONSE.sendToBackgroundPage({
                    providerType: type,
                    payload,
                    result,
                    error: null,
                })
            } catch (error) {
                EVM_Messages.events.INJECTED_PROVIDER_RPC_RESPONSE.sendToBackgroundPage({
                    providerType: type,
                    payload,
                    error: error instanceof Error ? error : new Error(),
                })
            }
        })
    }, [type, bridgedProvider, isContextMatched])

    useEffect(() => {
        return bridgedProvider.on('accountsChanged', async (event) => {
            if (!isContextMatched) return
            await Services.Ethereum.notifyEvent(providerType, 'accountsChanged', event)
        })
    }, [providerType, bridgedProvider, isContextMatched])

    useEffect(() => {
        return bridgedProvider.on('chainChanged', async (event) => {
            if (!isContextMatched) return
            await Services.Ethereum.notifyEvent(providerType, 'chainChanged', event)
        })
    }, [providerType, bridgedProvider, isContextMatched])

    useMount(onMounted)

    return null
}
