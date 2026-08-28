import { SURA_MSG, SuraEnvelope, SuraMsgType, GameCompletePayload } from './SuraTypes'

/**
 * Transporte postMessage del contrato real de integración SURA (ver
 * SuraTypes.ts). Ya no recibe un parentOrigin fijo por config -- lo captura
 * del `event.origin` del primer INIT_GAME válido, porque no hay forma de
 * conocerlo de antemano (no llega por query param ni por env var de build;
 * en la app nativa ni siquiera existe un origin real).
 */

type SuraMessageHandler<T = Record<string, unknown>> = (payload: T) => void

const INBOUND_TYPES: readonly SuraMsgType[] = [SURA_MSG.INIT, SURA_MSG.PAUSE, SURA_MSG.RESUME]

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
		// nativo de la app) tiene source === null -- se acepta. Cualquier otra
		// cosa que no sea la ventana padre real, se descarta.
		if (event.source !== null && event.source !== window.parent)
		{
			return
		}

		if (!isSuraEnvelope(event.data))
		{
			return
		}

		const envelope = event.data

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
		else if (this.parentOrigin !== null && event.origin !== this.parentOrigin)
		{
			// Una vez que conocemos al host real, se rechaza cualquier otro
			// origen que diga serlo. No aplica antes de conocerlo -- ahí no
			// hay nada sensible que proteger todavía.
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

		window.parent.postMessage(envelope, '*')
	}

	/** Resto de mensajes enveloped (SESSION_ACCEPTED, STARTED, ERROR, EXIT_REQUESTED). */
	send(type: SuraMsgType, payload: Record<string, unknown> = {})
	{
		if (!this.parentOrigin)
		{
			return
		}

		const envelope: SuraEnvelope = {
			type,
			payload
		}

		window.parent.postMessage(envelope, this.parentOrigin)
	}

	/**
	 * GAME_COMPLETE -- a diferencia del resto, va PLANO (sin envelope): el
	 * host lo descarta en silencio si llega anidado bajo `payload`.
	 */
	sendCompletion(data: GameCompletePayload)
	{
		if (!this.parentOrigin)
		{
			return
		}

		window.parent.postMessage({ type: SURA_MSG.COMPLETED, ...data }, this.parentOrigin)
	}

	destroy()
	{
		window.removeEventListener('message', this.handleMessage)
		this.listeners.clear()
	}
}
