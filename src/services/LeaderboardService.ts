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

/**
 * Leaderboard real de la partida, vía el endpoint público (sin auth) de
 * Sura: GET {apiBaseUrl}/minigames/v1/games/{gameId}/leaderboard.
 *
 * gameId y apiBaseUrl vienen del payload de INIT_GAME (ver
 * SuraIntegrationService.getGameId/getApiBaseUrl) -- Leaderboard.ts los lee
 * del registry y los pasa acá. Sin sesión SURA (standalone, o antes de que
 * el handshake termine) cae al listado mock de siempre.
 */
const fetchLeaderboard = async (params?: LeaderboardFetchParams): Promise<LeaderboardEntry[]> => {
	if (!params?.gameId || !params?.apiBaseUrl)
	{
		return MOCK_LEADERBOARD
	}

	try
	{
		const response = await fetch(`${params.apiBaseUrl}/minigames/v1/games/${params.gameId}/leaderboard?per_page=12`)

		if (!response.ok)
		{
			return MOCK_LEADERBOARD
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
		return MOCK_LEADERBOARD
	}
}

export default fetchLeaderboard

export type { LeaderboardEntry, LeaderboardFetchParams }
