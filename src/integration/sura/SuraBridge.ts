import { SURA_MSG, SuraEnvelope, SuraMsgType, GameCompletePayload } from './SuraTypes'

/**
 * Transporte postMessage del contrato real de integración SURA (ver
 * SuraTypes.ts). Ya no recibe un parentOrigin fijo por config -- lo captura
 * del `event.origin` del primer INIT_GAME válido, porque no hay forma de
 * conocerlo de antemano (no llega por query param ni por env var de build;
 * en la app nativa ni siquiera existe un origin real).
 *
 * Dos transportes distintos, no uno:
 *
 *  - **iframe (web)**: `window.parent.postMessage(...)`. El padre real es
 *    otra ventana, así que el mensaje efectivamente sale.
 *  - **WebView nativo (app mobile)**: el juego se carga TOP-LEVEL, o sea
 *    `window.parent === window`. Ahí `window.parent.postMessage()` se manda
 *    el mensaje a sí mismo y el host nativo NUNCA lo ve -- el canal real es
 *    `window.ReactNativeWebView.postMessage(string)`, y sólo acepta strings.
 *    Ése era el motivo por el que en mobile no se registraban ni el puntaje
 *    del ranking ni el pago de recompensas: GAME_COMPLETE salía al vacío.
 *
 * Lo mismo del lado entrante: el host nativo inyecta los mensajes con
 * `window.postMessage(JSON.stringify(data))` (y en Android viejo los
 * despacha sobre `document`, no sobre `window`), así que `event.data` puede
 * llegar como string JSON en vez de objeto.
 */

type SuraMessageHandler<T = Record<string, unknown>> = (payload: T) => void

type NativeWebView = { postMessage(data: string): void }

const INBOUND_TYPES: readonly SuraMsgType[] = [SURA_MSG.INIT, SURA_MSG.PAUSE, SURA_MSG.RESUME]

const getNativeWebView = (): NativeWebView | null => {
	const candidate = (window as unknown as { ReactNativeWebView?: NativeWebView }).ReactNativeWebView

	return candidate && typeof candidate.postMessage === 'function'
		? candidate
		: null
}

// El host nativo manda el envelope serializado. Se parsea acá y no en
// isSuraEnvelope para que el chequeo de forma siga trabajando siempre
// sobre un objeto.
const parseMessageData = (data: unknown): unknown => {
	if (typeof data !== 'string')
	{
		return data
	}

	// Descarte barato: cualquier string que no empiece como un objeto JSON
	// no puede ser un envelope, y los WebViews mandan mucho ruido ajeno
	// por este mismo canal.
	const trimmed = data.trim()
	if (trimmed.charAt(0) !== '{')
	{
		return data
	}

	try
	{
		return JSON.parse(trimmed)
	}
	catch
	{
		return data
	}
}

const isSuraEnvelope = (data: unknown): data is SuraEnvelope => {
	if (typeof data !== 'object' || data === null)
	{
		return false
	}

	const candidate = data as Record<string, unknown>

	return typeof candidate.type === 'string'
		&& (INBOUND_TYPES as readonly string[]).includes(candidate.type)
		&& typeof candidate.payload === 'object'
		&& candidate.payload !== null
}

export default class SuraBridge
{
	// Null hasta que llega el primer INIT_GAME válido -- ver handleMessage().
	private parentOrigin: string | null = null

	private listeners = new Map<SuraMsgType, Set<SuraMessageHandler>>()

	private handleMessage = (event: MessageEvent) => {
		// Un MessageEvent construido a mano (el bridge inyectado en el WebView
		// nativo de la app) tiene source === null -- se acepta. En el WebView
		// nativo window.parent ES window, así que un mensaje inyectado con
		// window.postMessage() llega con source === window y también vale.
		// Cualquier otra cosa que no sea la ventana padre real, se descarta.
		if (event.source !== null && event.source !== window.parent && event.source !== window)
		{
			return
		}

		const data = parseMessageData(event.data)

		if (!isSuraEnvelope(data))
		{
			return
		}

		const envelope = data

		if (envelope.type === SURA_MSG.INIT)
		{
			// El primer INIT_GAME válido define a quién le contestamos de acá
			// en más. event.origin puede venir vacío en algunas entregas
			// sintéticas/nativas -- '*' es el fallback seguro en vez de
			// quedar fijado a un string vacío que ningún postMessage real
			// va a volver a matchear.
			if (this.parentOrigin === null)
			{
				this.parentOrigin = event.origin || '*'
			}
		}
		else if (this.parentOrigin !== null && this.parentOrigin !== '*' && event.origin !== this.parentOrigin)
		{
			// Una vez que conocemos al host real, se rechaza cualquier otro
			// origen que diga serlo. No aplica antes de conocerlo -- ahí no
			// hay nada sensible que proteger todavía -- ni cuando quedó en
			// '*' (WebView nativo, donde no hay origin real que comparar).
			return
		}

		const handlers = this.listeners.get(envelope.type)

		if (!handlers)
		{
			return
		}

		handlers.forEach(handler => handler(envelope.payload))
	}

	constructor()
	{
		window.addEventListener('message', this.handleMessage)

		// Android WebView (RN < 0.60 y varios wrappers) despacha los mensajes
		// inyectados sobre `document`, no sobre `window`. Escuchar los dos no
		// duplica nada: el mismo MessageEvent no se entrega en ambos.
		document.addEventListener('message', this.handleMessage as EventListener)
	}

	/** True si corremos dentro del WebView nativo de la app (no en un iframe web). */
	get isNative()
	{
		return getNativeWebView() !== null
	}

	on(type: SuraMsgType, callback: SuraMessageHandler)
	{
		if (!this.listeners.has(type))
		{
			this.listeners.set(type, new Set())
		}

		this.listeners.get(type)!.add(callback)

		return () => {
			this.listeners.get(type)?.delete(callback)
		}
	}

	/**
	 * Punto único de salida. En el WebView nativo el canal es
	 * ReactNativeWebView.postMessage (string); en el iframe web es
	 * window.parent.postMessage (objeto estructurado). Si hay WebView nativo
	 * se usa SIEMPRE ése: window.parent es la propia ventana ahí, mandarle
	 * algo no lo ve nadie.
	 */
	private post(message: Record<string, unknown>, targetOrigin: string)
	{
		// Nunca propaga. Un postMessage puede tirar por motivos ajenos al
		// juego (origin rechazado, payload no clonable, bridge nativo a medio
		// inyectar) y antes esa excepción subía hasta handleInit: si reventaba
		// al acusar recibo de la sesión, el handshake quedaba cortado por la
		// mitad y el juego se quedaba sin sesión para siempre.
		try
		{
			const native = getNativeWebView()

			if (native)
			{
				native.postMessage(JSON.stringify(message))
				return
			}

			window.parent.postMessage(message, targetOrigin)
		}
		catch (error)
		{
			console.error('SuraBridge.post: no se pudo enviar el mensaje al host', error)
		}
	}

	/**
	 * MINIGAME_READY -- el mensaje que abre el handshake, así que sale antes
	 * de conocer el origin del host. No lleva nada sensible (game_id,
	 * version), así que apunta siempre a '*'.
	 */
	sendReady(payload: Record<string, unknown>)
	{
		const envelope: SuraEnvelope = {
			type: SURA_MSG.READY,
			payload
		}

		this.post(envelope as unknown as Record<string, unknown>, '*')
	}

	/** Resto de mensajes enveloped (SESSION_ACCEPTED, STARTED, ERROR, EXIT_REQUESTED). */
	send(type: SuraMsgType, payload: Record<string, unknown> = {})
	{
		// En nativo no hay origin que descubrir: el canal es el bridge
		// inyectado, siempre el mismo. Exigir parentOrigin ahí dejaba mudo
		// al juego si el INIT llegaba sin origin.
		if (!this.parentOrigin && !this.isNative)
		{
			return
		}

		const envelope: SuraEnvelope = {
			type,
			payload
		}

		this.post(envelope as unknown as Record<string, unknown>, this.parentOrigin || '*')
	}

	/**
	 * GAME_COMPLETE -- a diferencia del resto, va PLANO (sin envelope): el
	 * host lo descarta en silencio si llega anidado bajo `payload`.
	 */
	sendCompletion(data: GameCompletePayload)
	{
		if (!this.parentOrigin && !this.isNative)
		{
			return
		}

		this.post(
			{ type: SURA_MSG.COMPLETED, ...data } as unknown as Record<string, unknown>,
			this.parentOrigin || '*'
		)
	}

	destroy()
	{
		window.removeEventListener('message', this.handleMessage)
		document.removeEventListener('message', this.handleMessage as EventListener)
		this.listeners.clear()
	}
}
