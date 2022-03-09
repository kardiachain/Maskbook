import { getOpenSeaNFTList } from '@masknet/web3-providers'
import type { ERC721TokenDetailed } from '@masknet/web3-shared-base'
import type { ProducerArgBase, ProducerKeyFunction, ProducerPushFunction, RPCMethodRegistrationValue } from '../types'
import { collectAllPageData } from '../helper/request'
import type { Web3Plugin } from '@masknet/plugin-infra'

export interface NonFungibleTokenAssetArgs extends ProducerArgBase {
    address: string
    network?: Web3Plugin.NetworkDescriptor | null
}

const nonFungibleCollectibleAsset = async (
    push: ProducerPushFunction<ERC721TokenDetailed>,
    getKeys: ProducerKeyFunction,
    args: NonFungibleTokenAssetArgs,
): Promise<void> => {
    const { address, network, pageSize = 100 } = args
    const openSeaApiKey = await getKeys('opensea')

    // Alchemy api is used for polygon and flow network.
    // if (network) {
    //     await collectAllPageData<ERC721TokenDetailed>(
    //         async (page) => {
    //             const r = (await getAlchemyNFTList(address, network, page, pageSize)) as {
    //                 data: ERC721TokenDetailed[]
    //                 hasNextPage: boolean
    //             }
    //             return r
    //         },
    //         pageSize,
    //         push,
    //     )
    // }

    // if (network && network.ID !== `${PluginId.EVM}_ethereum`) return

    try {
        await collectAllPageData<ERC721TokenDetailed>(
            (page) => getOpenSeaNFTList(openSeaApiKey, address, page, pageSize),
            pageSize,
            push,
        )
    } finally {
        // const fromRarible = collectAllPageData<ERC721TokenDetailed>(
        //     (page, pageInfo) => getRaribleNFTList(openSeaApiKey, address, page, pageSize, pageInfo),
        //     pageSize,
        //     push,
        // )
        // const formNFTScanERC721 = collectAllPageData<ERC721TokenDetailed>(
        //     (page) => getNFTScanNFTs(address, 'erc721', page, pageSize),
        //     pageSize,
        //     push,
        // )
        // const fromNFTScanERC1155 = collectAllPageData<ERC721TokenDetailed>(
        //     (page) => getNFTScanNFTs(address, 'erc1155', page, pageSize),
        //     pageSize,
        //     push,
        // )
        // await Promise.allSettled([fromRarible, formNFTScanERC721, fromNFTScanERC1155])
    }
}

const producer: RPCMethodRegistrationValue<ERC721TokenDetailed, NonFungibleTokenAssetArgs> = {
    method: 'mask.fetchNonFungibleCollectibleAssetV2',
    producer: nonFungibleCollectibleAsset,
    distinctBy: (item) =>
        `${item.tokenId.toLowerCase()}_${item.contractDetailed.address.toLowerCase()}_${item.contractDetailed.chainId}`,
}

export default producer
