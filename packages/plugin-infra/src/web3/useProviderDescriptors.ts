import { usePluginIDContext } from '.'
import { getPluginDefine } from '..'
import type { NetworkPluginID } from '../web3-types'

export function useProviderDescriptors(expectedPluginID?: NetworkPluginID) {
    const pluginID = usePluginIDContext(expectedPluginID)
    return getPluginDefine(pluginID)?.declareWeb3Providers ?? []
}
