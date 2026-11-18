interface LeaderboardEntry
{
	rank: number
	alias: string
	score: number
}

interface LeaderboardFetchParams
{
	gameId?: string | null
	apiBaseUrl?: string | null
	// Corriendo dentro de SURA (iframe web o WebView nativo). Cambia qué pasa
	// cuando el fetch no se puede hacer o falla -- ver abajo.
	embedded?: boolean
}

interface ApiLeaderboardEntry
{
	position: number
	alias: string | null
	best_score: number
}

interface ApiLeaderboardResponse
{
	data: {
		entries: ApiLeaderboardEntry[]
	}
}

/**
 * Con señal mala el fetch se queda colgado indefinidamente y la pantalla no
 * sale nunca de "Cargando...". Pasado este tiempo se aborta y se muestra el
 * error.
 */
const FETCH_TIMEOUT_MS = 8000

/**
 * SÓLO para la versión suelta (standalone), que no tiene backend contra el
 * cual pedir nada. Embebido en SURA esta lista NO se usa nunca: mostrar
 * nombres inventados como si fueran el ranking real es peor que mostrar un
 * error -- de hecho es exactamente lo que se veía en mobile como "el ranking
 * cargó mal" cuando el handshake fallaba.
 */
const MOCK_LEADERBOARD: LeaderboardEntry[] = [
	{ rank: 1, alias: 'BubblePopper99', score: 15420 },
	{ rank: 2, alias: 'JoyStickJoe', score: 14890 },
	{ rank: 3, alias: 'NachoGamer', score: 13275 },
	{ rank: 4, alias: 'PixelQueen', score: 12100 },
	{ rank: 5, alias: 'ComboKing', score: 11540 },
	{ rank: 6, alias: 'RetroRaya', score: 10890 },
	{ rank: 7, alias: 'ChainReaction', score: 9950 },
	{ rank: 8, alias: 'ShooterPro', score: 9210 },
	{ rank: 9, alias: 'BurbujaFeroz', score: 8430 },
	{ rank: 10, alias: 'LuckyPop', score: 7650 }
]

const fetchWithTimeout = async (url: string) => {
	// AbortController existe en todos los WebViews que nos importan, pero si
	// faltara igual conviene pedir el recurso sin timeout antes que romper.
	if (typeof AbortController === 'undefined')
	{
		return fetch(url)
	}

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

	try
	{
		return await fetch(url, { signal: controller.signal })
	}
	finally
	{
		clearTimeout(timer)
	}
}

/**
 * Leaderboard real de la partida, vía el endpoint público (sin auth) de
 * Sura: GET {apiBaseUrl}/minigames/v1/games/{gameId}/leaderboard.
 *
 * gameId y apiBaseUrl vienen del payload de INIT_GAME (ver
 * SuraIntegrationService.getGameId/getApiBaseUrl) -- Leaderboard.ts los lee
 * del registry y los pasa acá.
 *
 * Devuelve `null` cuando el ranking real no se pudo traer estando embebido:
 * el que llama muestra un error, nunca datos de relleno.
 */
const fetchLeaderboard = async (params?: LeaderboardFetchParams): Promise<LeaderboardEntry[] | null> => {
	if (!params?.gameId || !params?.apiBaseUrl)
	{
		// Sin handshake no hay a quién preguntarle. Embebido eso es un fallo
		// real (el host tendría que haber mandado INIT_GAME); suelto es el
		// modo normal de la build standalone.
		return params?.embedded ? null : MOCK_LEADERBOARD
	}

	try
	{
		const response = await fetchWithTimeout(`${params.apiBaseUrl}/minigames/v1/games/${params.gameId}/leaderboard?per_page=12`)

		if (!response.ok)
		{
			return params.embedded ? null : MOCK_LEADERBOARD
		}

		const body = await response.json() as ApiLeaderboardResponse

		return body.data.entries.map(entry => ({
			rank: entry.position,
			// El backend puede mandar alias null (jugador sin nickname) --
			// placeholder genérico, nunca un nombre inventado.
			alias: entry.alias ?? `Player ${entry.position}`,
			score: entry.best_score
		}))
	}
	catch
	{
		return params.embedded ? null : MOCK_LEADERBOARD
	}
}

export default fetchLeaderboard

export type { LeaderboardEntry, LeaderboardFetchParams }
