/**
 * Detección standalone vs. embebido en SURA.
 *
 * Antes dependía de que la URL trajera `?parent_origin=...` además de estar
 * en un iframe -- pero el host real nunca manda ese query param (lo agrega
 * al token, no acá), así que esta detección nunca daba `true` embebido de
 * verdad. Tampoco había forma de detectar la app nativa (WebView top-level,
 * donde `window.parent === window` siempre).
 *
 * Ahora, según el contrato de integración (Sura, 28/08/2026): embebido es
 * simplemente correr dentro de un iframe O dentro del WebView de la app
 * nativa. El parentOrigin ya no se lee de acá -- lo captura SuraBridge del
 * `event.origin` del primer INIT_GAME real (ver SuraBridge.ts). gameId y
 * apiBaseUrl tampoco son constantes de build: llegan en el payload de
 * INIT_GAME (ver SuraIntegrationService.handleInit).
 */

const GAME_SLUG = 'joystick-pop'
const CONTRACT_VERSION = 1

interface SuraRuntimeConfig
{
	isEmbedded: boolean
	gameSlug: string
	version: number
}

const getSuraConfig = (): SuraRuntimeConfig => {
	const nativeWebView = (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView
	const isEmbedded = window.parent !== window || Boolean(nativeWebView)

	return {
		isEmbedded,
		gameSlug: GAME_SLUG,
		version: CONTRACT_VERSION
	}
}

export default getSuraConfig

export {
	SuraRuntimeConfig
}
