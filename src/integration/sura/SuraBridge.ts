import { SURA_MSG, SuraEnvelope, SuraMsgType } from './SuraTypes'

/**
 * Transporte postMessage del contrato canónico SURA.
 * Ver MINIGAME_INTEGRATION_CONTRACT.md, sección 3 ("Reglas de transporte").
 */

type SuraMessageHandler<T = Record<string, unknown>> = (payload: T) => void

const SURA_MSG_VALUES: readonly string[] = Object.keys(SURA_MSG)
	.map(key => SURA_MSG[key as keyof typeof SURA_MSG])

const isSuraEnvelope = (data: unknown): data is SuraEnvelope => {
	if (typeof data !== 'object' || data === null)
	{
		return false
	}

	const candidate = data as Record<string, unknown>

	return candidate.source === 'sura-minigames'
		&& candidate.version === 1
		&& typeof candidate.type === 'string'
		&& SURA_MSG_VALUES.includes(candidate.type)
		&& typeof candidate.payload === 'object'
		&& candidate.payload !== null
}

export default class SuraBridge
{
	private parentOrigin: string
	private listeners = new Map<SuraMsgType, Set<SuraMessageHandler>>()

	private handleMessage = (event: MessageEvent) => {
		if (event.origin !== this.parentOrigin || event.source !== window.parent)
		{
			return
		}

		if (!isSuraEnvelope(event.data))
		{
			return
		}

		const envelope = event.data
		const handlers = this.listeners.get(envelope.type)

		if (!handlers)
		{
			return
		}

		handlers.forEach(handler => handler(envelope.payload))
	}

	constructor(parentOrigin: string)
	{
		this.parentOrigin = parentOrigin

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

	send(type: SuraMsgType, payload: Record<string, unknown> = {})
	{
		const envelope: SuraEnvelope = {
			source: 'sura-minigames',
			version: 1,
			type,
			payload
		}

		window.parent.postMessage(envelope, this.parentOrigin)
	}

	destroy()
	{
		window.removeEventListener('message', this.handleMessage)
		this.listeners.clear()
	}
}
