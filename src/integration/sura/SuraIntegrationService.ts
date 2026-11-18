import SuraBridge from './SuraBridge'
import getSuraConfig from './SuraRuntimeConfig'
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
	bestScore?: number
}

// Misma key que Game.ts:handleGameOver() lee/escribe -- exportada acá para
// que ambos lados nunca queden desincronizados si el nombre cambia.
export const STORAGE_KEY_RECORD = 'bubbleBlastSuraRecord'

/**
 * MINIGAME_READY se reintenta hasta que llega el INIT_GAME.
 *
 * Se mandaba una sola vez, apenas arrancaba Bootstrap. En el iframe web eso
 * alcanza: el padre ya tiene su listener puesto antes de que el iframe
 * siquiera cargue. En el WebView nativo NO: el bridge del host se inyecta
 * cuando la página termina de cargar, así que un READY disparado antes se
 * pierde para siempre -- el host nunca manda INIT_GAME, el juego se queda
 * sin sessionId, y entonces GAME_COMPLETE no sale (ver notifyCompleted) y
 * el leaderboard cae al mock (ver LeaderboardService). O sea: ni puntaje de
 * ranking ni pago de recompensas en mobile, que es exactamente el síntoma
 * reportado. Reintentar es inofensivo -- el host ignora los READY de más.
 */
const READY_RETRY_INTERVAL_MS = 600
const READY_RETRY_MAX_ATTEMPTS = 40

/**
 * A partir de acá se da el handshake por perdido. Quien espera la sesión
 * (hoy: la pantalla de ranking) necesita un "no va a llegar" explícito --
 * sin eso se queda en "Cargando..." para siempre cuando el host no
 * contesta. 10s cubre con holgura el arranque de la app nativa.
 */
const HANDSHAKE_TIMEOUT_MS = 10000

/**
 * Ventana para que aparezca el bridge nativo. El servicio arranca aunque el
 * juego todavía parezca top-level, porque en el WebView de la app
 * `window.ReactNativeWebView` se inyecta después de la carga. Si pasado este
 * tiempo sigue sin haber ni iframe ni bridge, es una build suelta de verdad
 * y se corta ahí -- sin esto, la build standalone se quedaría los 10s
 * enteros del timeout de handshake esperando a un host que no existe.
 */
const STANDALONE_DETECTION_MS = 3000

type SuraLifecycleCallback = () => void

// `ready` es false cuando el handshake se dio por perdido (timeout): el
// que esperaba la sesión tiene que poder distinguir "todavía no llegó" de
// "no va a llegar".
type SuraSessionCallback = (ready: boolean) => void

export default class SuraIntegrationService
{
	private bridge: SuraBridge
	private gameSlug: string
	private version: number

	private state = SuraIntegrationState.Booting
	private session?: SuraSession

	private readyRetryTimer?: ReturnType<typeof setInterval>
	private readyAttempts = 0

	private handshakeTimer?: ReturnType<typeof setTimeout>
	private standaloneTimer?: ReturnType<typeof setTimeout>
	private handshakeFailed = false

	/**
	 * Mejor score logrado en ESTA carga de página. Es lo único que puede
	 * superar legítimamente al récord de la cuenta: una partida recién
	 * terminada que todavía no hizo el round-trip al backend. Vive en memoria
	 * a propósito -- un reload lo pierde, así que un valor viejo del
	 * dispositivo nunca puede sobrevivir a la verdad del servidor.
	 */
	private pendingLocalBest = 0

	private sessionCallbacks = new Set<SuraSessionCallback>()

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
		this.sendReady()

		this.state = SuraIntegrationState.Ready
		this.state = SuraIntegrationState.AwaitingInit

		this.readyRetryTimer = setInterval(() => {
			if (this.session || this.readyAttempts >= READY_RETRY_MAX_ATTEMPTS)
			{
				this.stopReadyRetries()
				return
			}

			this.sendReady()
		}, READY_RETRY_INTERVAL_MS)

		this.handshakeTimer = setTimeout(() => {
			this.failHandshake()
		}, HANDSHAKE_TIMEOUT_MS)

		this.standaloneTimer = setTimeout(() => {
			if (this.session || getSuraConfig().isEmbedded)
			{
				return
			}

			this.failHandshake()
		}, STANDALONE_DETECTION_MS)
	}

	private failHandshake()
	{
		if (this.session || this.handshakeFailed)
		{
			return
		}

		this.handshakeFailed = true
		this.stopReadyRetries()
		this.clearHandshakeTimeout()
		this.notifySessionCallbacks(false)
	}

	/**
	 * Avisa cuando el handshake terminó -- con sesión (`true`) o dado por
	 * perdido (`false`). Si ya terminó al momento de registrarse, el callback
	 * corre en el acto en vez de quedar esperando un evento que ya pasó: en
	 * mobile el host suele contestar el INIT_GAME antes de que la pantalla
	 * que lo necesita siquiera exista.
	 */
	onSessionReady(callback: SuraSessionCallback)
	{
		if (this.session)
		{
			callback(true)
			return () => {}
		}

		if (this.handshakeFailed)
		{
			callback(false)
			return () => {}
		}

		this.sessionCallbacks.add(callback)

		return () => {
			this.sessionCallbacks.delete(callback)
		}
	}

	private notifySessionCallbacks(ready: boolean)
	{
		const callbacks = Array.from(this.sessionCallbacks)
		this.sessionCallbacks.clear()
		callbacks.forEach(callback => callback(ready))
	}

	private sendReady()
	{
		this.readyAttempts += 1

		this.bridge.sendReady({
			game_id: this.gameSlug,
			version: this.version
		})
	}

	private stopReadyRetries()
	{
		if (this.readyRetryTimer === undefined)
		{
			return
		}

		clearInterval(this.readyRetryTimer)
		this.readyRetryTimer = undefined
	}

	private handleInit(payload: SuraMinigameInitPayload)
	{
		this.stopReadyRetries()

		// Con los READY reintentados, el host puede contestar más de un
		// INIT_GAME para la misma sesión. Re-acusar recibo es correcto (el
		// host puede haberse perdido el SESSION_ACCEPTED anterior), pero
		// pisar la sesión en curso con un estado ya avanzado no: eso
		// retrocedería la máquina de estados de Started a SessionAccepted.
		if (this.session && this.session.sessionId === payload.sessionId)
		{
			this.bridge.send(SURA_MSG.SESSION_ACCEPTED, {
				session_id: this.session.sessionId,
				game_id: this.session.gameId
			})

			return
		}

		this.session = {
			token: payload.token,
			sessionId: payload.sessionId,
			gameId: payload.gameId ?? '',
			apiBaseUrl: payload.apiBaseUrl ?? '',
			// Puede llegar vacío (jugador sin nickname) -- quien lo consuma
			// muestra un placeholder genérico, nunca un nombre inventado.
			nickname: payload.username,
			bestScore: payload.bestScore
		}

		// El récord de la cuenta manda: para arriba Y para abajo.
		//
		// Antes esto sólo subía el valor local, y la intención era buena -- no
		// borrar una victoria recién hecha que todavía no llegó al backend.
		// Pero el efecto era que cualquier número que entrara una vez al
		// localStorage se quedaba ahí para siempre. Un score forjado, o un
		// `personalBest` viejo que el backend mandó una vez, seguía
		// mostrándose como récord del jugador aunque el servidor ya dijera
		// otra cosa, porque la comparación nunca lo dejaba bajar. Es
		// exactamente el "me figura un récord que nunca hice y no se me
		// actualiza": limpiar la base no alcanzaba, el número estaba en el
		// dispositivo.
		//
		// Y como el localStorage es por dispositivo y por origen, el iframe de
		// la web y la WebView de la app tienen almacenamientos separados: el
		// mismo jugador veía un récord distinto en cada plataforma.
		//
		// `pendingLocalBest` conserva el caso legítimo sin la permanencia.
		if (this.session.bestScore !== undefined)
		{
			const record = Math.max(this.session.bestScore, this.pendingLocalBest)
			localStorage.setItem(STORAGE_KEY_RECORD, String(record))
		}

		this.bridge.send(SURA_MSG.SESSION_ACCEPTED, {
			session_id: this.session.sessionId,
			game_id: this.session.gameId
		})

		this.state = SuraIntegrationState.SessionAccepted

		this.clearHandshakeTimeout()
		this.notifySessionCallbacks(true)
	}

	private clearHandshakeTimeout()
	{
		if (this.handshakeTimer !== undefined)
		{
			clearTimeout(this.handshakeTimer)
			this.handshakeTimer = undefined
		}

		if (this.standaloneTimer !== undefined)
		{
			clearTimeout(this.standaloneTimer)
			this.standaloneTimer = undefined
		}
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
		// Se registra antes del early return, a propósito: `pendingLocalBest`
		// significa "lo mejor que se logró en esta página", no "lo mejor que se
		// llegó a enviar". Si el próximo INIT_GAME trae un bestScore que
		// todavía no incluye esta partida, esto evita que el menú muestre un
		// récord más bajo del que el jugador acaba de hacer.
		if (score > this.pendingLocalBest)
		{
			this.pendingLocalBest = score
		}

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
		this.stopReadyRetries()
		this.clearHandshakeTimeout()
		this.sessionCallbacks.clear()
		this.pauseCallbacks.clear()
		this.resumeCallbacks.clear()
		this.bridge.destroy()
	}
}

export {
	SuraIntegrationState,
	SuraIntegrationConfig
}
