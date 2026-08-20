interface LeaderboardEntry
{
	rank: number
	alias: string
	score: number
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

// TODO: reemplazar por el fetch real al endpoint del backend cuando esté
// disponible (ej. fetch('/api/leaderboard').then(r => r.json())) — la firma
// (Promise<LeaderboardEntry[]>) ya queda lista para eso, así el resto de la
// UI (Leaderboard.ts / LeaderboardPanel.tsx) no necesita cambios
const fetchLeaderboard = (): Promise<LeaderboardEntry[]> => {
	return Promise.resolve(MOCK_LEADERBOARD)
}

export default fetchLeaderboard

export type { LeaderboardEntry }
