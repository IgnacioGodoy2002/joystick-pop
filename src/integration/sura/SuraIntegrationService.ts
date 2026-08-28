import SuraBridge from './SuraBridge'
import {
	SURA_MSG,
	SuraMinigameInitPayload
} from './SuraTypes'

/**
 * Máquina de estados del ciclo de vida de integración SURA.
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
	gameSlug: string
	version: number
}

interface SuraSession
{
	token: string
	sessionId: string
	gameId: string
	apiBaseUrl: string
	nickname?: string
}

type SuraLifecycleCallback = () => void

export default class SuraIntegrationService
{
	private bridge: SuraBridge
	private gameSlug: string
	private version: number

	private state = SuraIntegrationState.Booting
	private session?: SuraSession

	private pauseCallbacks = new Set<SuraLifecycleCallback>()
	private resumeCallbacks = new Set<SuraLifecycleCallback>()

	get currentState()
	{
		return this.state
	}

	/** Nombre a mostrar del jugador, tal como lo mandó el host -- null hasta el handshake. */
	getNickname(): string | null
	{
		return this.session?.nickname ?? null
	}

	/** UUID real del minijuego en el backend de Sura -- null hasta el handshake. */
	getGameId(): string | null
	{
		return this.session?.gameId || null
	}

	/** Base de la API de Sura, ya con /api incluido -- null hasta el handshake. */
	getApiBaseUrl(): string | null
	{
		return this.session?.apiBaseUrl || null
	}

	constructor(config: SuraIntegrationConfig)
	{
		this.gameSlug = config.gameSlug
		this.version = config.version
		this.bridge = new SuraBridge()

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
		this.bridge.sendReady({
			game_id: this.gameSlug,
			version: this.version
		})

		this.state = SuraIntegrationState.Ready
		this.state = SuraIntegrationState.AwaitingInit
	}

	private handleInit(payload: SuraMinigameInitPayload)
	{
		this.session = {
			token: payload.token,
			sessionId: payload.sessionId,
			gameId: payload.gameId ?? '',
			apiBaseUrl: payload.apiBaseUrl ?? '',
			// Puede llegar vacío (jugador sin nickname) -- quien lo consuma
			// muestra un placeholder genérico, nunca un nombre inventado.
			nickname: payload.username
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

	/**
	 * durationMs es opcional pero conviene mandarlo siempre que se tenga: el
	 * servidor toma min(tiempo medido por el server, duration_ms), así que
	 * reportarlo honesto solo puede bajar el techo de anti-cheat, nunca
	 * subirlo -- juzga la partida contra su duración real, no contra cuánto
	 * estuvo la pantalla abierta.
	 */
	notifyCompleted(score: number, durationMs?: number)
	{
		if (!this.session)
		{
			return
		}

		this.bridge.sendCompletion({
			sessionId: this.session.sessionId,
			score,
			provider: 'tingz',
			duration_ms: durationMs
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
