/**
 * Detección standalone vs. embebido en SURA.
 *
 * Se considera "embebido" solo si se cumplen las DOS condiciones:
 *
 *  1. El documento corre dentro de un iframe (`window.parent !== window`).
 *     Descarta abrir el juego directo en una pestaña.
 *  2. La URL trae el query param `parent_origin`. El host SURA lo agrega
 *     siempre al `launchUrl` (igual que el token, ver contrato §7: "el
 *     token viaja al juego por query param del launchUrl"). Sin este
 *     param no hay forma confiable de saber a qué origin responderle.
 *
 * Ninguna condición sola alcanza: un iframe de testing/local cumpliría (1)
 * sin (2), y pegar el query param en una pestaña suelta cumpliría (2) sin
 * (1). Exigir ambas evita falsos positivos en los dos sentidos.
 */

const GAME_ID = 'joystick-pop'
const CONTRACT_VERSION = 1

interface SuraRuntimeConfig
{
	isEmbedded: boolean
	parentOrigin: string
	gameId: string
	version: 1
}

const isRunningInIframe = () => window.parent !== window

const getQueryParam = (name: string) => new URLSearchParams(window.location.search).get(name)

const getSuraConfig = (): SuraRuntimeConfig => {
	const parentOrigin = getQueryParam('parent_origin')
	const isEmbedded = isRunningInIframe() && !!parentOrigin

	return {
		isEmbedded,
		// En modo standalone no se manda ningún postMessage, así que este
		// valor nunca se usa como targetOrigin real — es solo un placeholder.
		parentOrigin: isEmbedded ? (parentOrigin as string) : 'standalone',
		gameId: GAME_ID,
		version: CONTRACT_VERSION
	}
}

export default getSuraConfig

export {
	SuraRuntimeConfig
}
