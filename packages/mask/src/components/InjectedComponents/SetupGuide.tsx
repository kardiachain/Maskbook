import { useMemo, useState, useEffect, useRef } from 'react'
import { makeStyles } from '@masknet/theme'
import { useValueRef } from '@masknet/shared-base-ui'
import { useI18N, MaskMessages } from '../../utils'
import { activatedSocialNetworkUI, SocialNetworkUI } from '../../social-network'
import { currentSetupGuideStatus, languageSettings, userGuideStatus, userPinExtension } from '../../settings/settings'
import type { SetupGuideCrossContextStatus } from '../../settings/types'
import { makeTypedMessageText } from '@masknet/typed-message'
import {
    PersonaIdentifier,
    ProfileIdentifier,
    Identifier,
    ECKeyIdentifier,
    NextIDPlatform,
    toBase64,
    fromHex,
    NextIDAction,
    EnhanceableSite,
} from '@masknet/shared-base'
import Services from '../../extension/service'
import { useLastRecognizedIdentity } from '../DataSource/useActivatedUI'
import { useAsync, useCopyToClipboard } from 'react-use'
import stringify from 'json-stable-stringify'
import type { NextIDPayload } from '@masknet/shared-base'
import { SetupGuideStep } from './SetupGuide/types'
import { FindUsername } from './SetupGuide/FindUsername'
import { VerifyNextID } from './SetupGuide/VerifyNextID'
import { PinExtension } from './SetupGuide/PinExtension'
import { bindProof, createPersonaPayload, queryIsBound } from '@masknet/web3-providers'

// #region setup guide ui
interface SetupGuideUIProps {
    persona: PersonaIdentifier
    onClose?: () => void
}

interface SignInfo {
    payload: NextIDPayload
    personaSign: string
    twitterPost: string
}

function SetupGuideUI(props: SetupGuideUIProps) {
    const { t } = useI18N()
    const { persona } = props
    const ui = activatedSocialNetworkUI
    const [, copyToClipboard] = useCopyToClipboard()
    const [step, setStep] = useState(SetupGuideStep.FindUsername)
    const [enableNextID] = useState(ui.configuration.nextIDConfig?.enable)
    const verifyPostCollectTimer = useRef<NodeJS.Timer | null>(null)
    const platform = ui.configuration.nextIDConfig?.platform as NextIDPlatform

    // #region parse setup status
    const lastStateRef = currentSetupGuideStatus[ui.networkIdentifier]
    const lastState_ = useValueRef(lastStateRef)
    const lastState = useMemo<SetupGuideCrossContextStatus>(() => {
        try {
            return JSON.parse(lastState_)
        } catch {
            return {}
        }
    }, [lastState_])
    useEffect(() => {
        setStep(lastState.status ?? SetupGuideStep.Close)
    }, [lastState])
    // #endregion

    // #region setup username
    const lastRecognized = useLastRecognizedIdentity()
    const getUsername = () =>
        lastState.username || (lastRecognized.identifier.isUnknown ? '' : lastRecognized.identifier.userId)
    const [username, setUsername] = useState(getUsername)

    useEffect(() => {
        const handler = (val: SocialNetworkUI.CollectingCapabilities.IdentityResolved) => {
            if (username === '' && !val.identifier.isUnknown) setUsername(val.identifier.userId)
        }
        ui.collecting.identityProvider?.recognized.addListener(handler)

        return () => {
            ui.collecting.identityProvider?.recognized.removeListener(handler)
        }
    }, [username])

    useEffect(() => {
        if (username || ui.networkIdentifier !== EnhanceableSite.Twitter) return
        // In order to collect user info after login, need to reload twitter once
        let reloaded = false
        const handler = () => {
            // twitter will redirect to home page after login
            if (!(!reloaded && location.pathname === '/home')) return
            reloaded = true
            location.reload()
        }
        window.addEventListener('locationchange', handler)
        return () => {
            window.removeEventListener('locationchange', handler)
        }
    }, [username])
    // #endregion

    const { value: persona_ } = useAsync(async () => {
        return Services.Identity.queryPersona(Identifier.fromString(persona.toText(), ECKeyIdentifier).unwrap())
    }, [persona])

    const onConnect = async () => {
        // attach persona with SNS profile
        await Services.Identity.attachProfile(new ProfileIdentifier(ui.networkIdentifier, username), persona, {
            connectionConfirmState: 'confirmed',
        })

        // auto-finish the setup process
        if (!persona_?.hasPrivateKey) throw new Error('invalid persona')
        await Services.Identity.setupPersona(persona_?.identifier)
    }

    const onVerify = async () => {
        if (!persona_?.publicHexKey) return
        const collectVerificationPost = ui.configuration.nextIDConfig?.collectVerificationPost

        const platform = ui.configuration.nextIDConfig?.platform as NextIDPlatform | undefined
        if (!platform) return

        const isBound = await queryIsBound(persona_.publicHexKey, platform, username)
        if (!isBound) {
            const payload = await createPersonaPayload(
                persona_.publicHexKey,
                NextIDAction.Create,
                username,
                platform,
                languageSettings.value ?? 'default',
            )
            if (!payload) throw new Error('Failed to create persona payload.')
            const signResult = await Services.Identity.signWithPersona({
                method: 'eth',
                message: payload.signPayload,
                identifier: persona_.identifier.toText(),
            })
            if (!signResult) throw new Error('Failed to sign by persona.')
            const signature = signResult.signature.signature
            const postContent = payload.postContent.replace('%SIG_BASE64%', toBase64(fromHex(signature)))
            ui.automation?.nativeCompositionDialog?.appendText?.(postContent, { recover: false })

            const waitingPost = new Promise<void>((resolve, reject) => {
                verifyPostCollectTimer.current = setInterval(async () => {
                    const post = collectVerificationPost?.(postContent)
                    if (post && persona_.publicHexKey) {
                        clearInterval(verifyPostCollectTimer.current!)
                        await bindProof(
                            payload.uuid,
                            persona_.publicHexKey,
                            NextIDAction.Create,
                            platform,
                            username,
                            payload.createdAt,
                            {
                                signature,
                                proofLocation: post.postId,
                            },
                        )
                        resolve()
                    }
                }, 1000)

                setTimeout(() => {
                    clearInterval(verifyPostCollectTimer.current!)
                    reject({ message: t('setup_guide_verify_post_not_found') })
                }, 1000 * 20)
            })

            await waitingPost
            const isBound = await queryIsBound(persona_.publicHexKey, platform, username)
            if (!isBound) throw new Error('Failed to verify.')
            MaskMessages.events.ownProofChanged.sendToAll(undefined)
        }
    }

    const onClose = () => {
        currentSetupGuideStatus[ui.networkIdentifier].value = ''
        setStep(SetupGuideStep.Close)
    }

    const onConnected = async () => {
        if (enableNextID && persona_?.publicHexKey && platform && username) {
            const isBound = await queryIsBound(persona_.publicHexKey, platform, username)
            if (!isBound) {
                currentSetupGuideStatus[ui.networkIdentifier].value = stringify({
                    status: SetupGuideStep.VerifyOnNextID,
                })
                setStep(SetupGuideStep.VerifyOnNextID)
                return
            }
        }

        if (!userPinExtension.value) {
            userPinExtension.value = true
            setStep(SetupGuideStep.PinExtension)
            return
        }

        onDone()
    }

    const onVerifyDone = async () => {
        if (!userPinExtension.value) {
            userPinExtension.value = true
            setStep(SetupGuideStep.PinExtension)
            return
        }

        onDone()
    }

    const onDone = async () => {
        const network = ui.networkIdentifier
        if (network === EnhanceableSite.Twitter && userGuideStatus[network].value !== 'completed') {
            userGuideStatus[network].value = '1'
        } else {
            onCreate()
        }

        onClose()
    }

    const onCreate = async () => {
        let content = t('setup_guide_say_hello_content')
        if (ui.networkIdentifier === EnhanceableSite.Twitter) {
            content += t('setup_guide_say_hello_follow', { account: '@realMaskNetwork' })
        }

        ui.automation.maskCompositionDialog?.open?.(makeTypedMessageText(content), {
            target: 'Everyone',
        })
    }

    switch (step) {
        case SetupGuideStep.FindUsername:
            return (
                <FindUsername
                    personaName={persona_?.nickname}
                    username={username}
                    avatar={lastRecognized.avatar}
                    onUsernameChange={setUsername}
                    onConnect={onConnect}
                    onDone={onConnected}
                    onClose={onClose}
                    enableNextID={enableNextID}
                />
            )
        case SetupGuideStep.VerifyOnNextID:
            return (
                <VerifyNextID
                    personaIdentifier={persona_?.identifier}
                    personaName={persona_?.nickname}
                    username={username}
                    network={ui.networkIdentifier}
                    avatar={lastRecognized.avatar}
                    onUsernameChange={setUsername}
                    onVerify={onVerify}
                    onDone={onVerifyDone}
                    onClose={onClose}
                />
            )
        case SetupGuideStep.PinExtension:
            return <PinExtension onDone={onDone} />
        default:
            return null
    }
}
// #endregion

// #region setup guide
const useSetupGuideStyles = makeStyles()({
    root: {
        position: 'fixed',
        zIndex: 9999,
        maxWidth: 550,
        top: '2em',
        right: '2em',
    },
})
export interface SetupGuideProps extends SetupGuideUIProps {}

export function SetupGuide(props: SetupGuideProps) {
    const { classes } = useSetupGuideStyles()
    return (
        <div className={classes.root}>
            <SetupGuideUI {...props} />
        </div>
    )
}
// #endregion
