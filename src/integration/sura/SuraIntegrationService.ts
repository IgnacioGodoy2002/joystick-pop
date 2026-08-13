import SuraBridge from './SuraBridge'
import {
	SURA_MSG,
	SuraMinigameInitPayload
} from './SuraTypes'

/**
 * Máquina de estados del ciclo de vida de integración SURA.
 * Ver MINIGAME_INTEGRATION_CONTRACT.md, sección 5.
 */

enum SuraIntegrationState
{
	Booting,
	Ready,
	AwaitingInit,
	SessionAccepted,
	Started,
	Completed
}

interface SuraIntegrationConfig
{
	gameId: string
	version: number
	parentOrigin: string
}

interface SuraSession
{
	token: string
	sessionId: string
	playerId: string
	gameId: string
	nickname?: string
}

type SuraLifecycleCallback = () => void

export default class SuraIntegrationService
{
	private bridge: SuraBridge
	private gameId: string
	private version: number

	private state = SuraIntegrationState.Booting
	private session?: SuraSession

	private pauseCallbacks = new Set<SuraLifecycleCallback>()
	private resumeCallbacks = new Set<SuraLifecycleCallback>()

	get currentState()
	{
		return this.state
	}

	constructor(config: SuraIntegrationConfig)
	{
		this.gameId = config.gameId
		this.version = config.version
		this.bridge = new SuraBridge(config.parentOrigin)

		this.bridge.on(SURA_MSG.INIT, payload => {
			this.handleInit(payload as unknown as SuraMinigameInitPayload)
		})

		this.bridge.on(SURA_MSG.PAUSE, () => {
			this.pauseCallbacks.forEach(callback => callback())
		})

		this.bridge.on(SURA_MSG.RESUME, () => {
			this.resumeCallbacks.forEach(callback => callback())
		})
	}

	start()
	{
		this.bridge.send(SURA_MSG.READY, {
			game_id: this.gameId,
			version: this.version
		})

		this.state = SuraIntegrationState.Ready
		this.state = SuraIntegrationState.AwaitingInit
	}

	private handleInit(payload: SuraMinigameInitPayload)
	{
		this.session = {
			token: payload.token,
			sessionId: payload.session_id,
			playerId: payload.player_id,
			gameId: payload.game_id,
			nickname: payload.nickname
		}

		this.bridge.send(SURA_MSG.SESSION_ACCEPTED, {
			session_id: this.session.sessionId,
			game_id: this.session.gameId
		})

		this.state = SuraIntegrationState.SessionAccepted
	}

	notifyStarted()
	{
		if (!this.session)
		{
			return
		}

		this.bridge.send(SURA_MSG.STARTED, {
			session_id: this.session.sessionId,
			game_id: this.session.gameId
		})

		this.state = SuraIntegrationState.Started
	}

	notifyCompleted(score: number, stats?: Record<string, unknown>)
	{
		if (!this.session)
		{
			return
		}

		this.bridge.send(SURA_MSG.COMPLETED, {
			session_id: this.session.sessionId,
			game_id: this.session.gameId,
			score,
			stats
		})

		this.state = SuraIntegrationState.Completed
	}

	notifyExitRequested()
	{
		this.bridge.send(SURA_MSG.EXIT_REQUESTED, {})
	}

	notifyError(message: string)
	{
		this.bridge.send(SURA_MSG.ERROR, {
			session_id: this.session?.sessionId,
			message
		})
	}

	onPause(callback: SuraLifecycleCallback)
	{
		this.pauseCallbacks.add(callback)

		return () => {
			this.pauseCallbacks.delete(callback)
		}
	}

	onResume(callback: SuraLifecycleCallback)
	{
		this.resumeCallbacks.add(callback)

		return () => {
			this.resumeCallbacks.delete(callback)
		}
	}

	destroy()
	{
		this.pauseCallbacks.clear()
		this.resumeCallbacks.clear()
		this.bridge.destroy()
	}
}

export {
	SuraIntegrationState,
	SuraIntegrationConfig
}
