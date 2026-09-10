// `env(safe-area-inset-*)` (disponible porque index.html tiene
// `viewport-fit=cover` en el meta viewport) no es directamente legible desde
// JS -- el truco estándar es crear un elemento oculto con
// `padding: env(safe-area-inset-*)` y leer el padding resuelto vía
// `getComputedStyle`. Devuelve CSS px reales del navegador (NO multiplicados
// por devicePixelRatio -- el caller es responsable de llevarlos al espacio
// de coordenadas que necesite, p. ej. `this.scale.width/height` de Phaser,
// que ya viene multiplicado por DPR).
//
// No cachea el resultado: es barato de recalcular y el valor puede cambiar
// con una rotación de pantalla o al entrar/salir de fullscreen.
export interface SafeAreaInsets
{
	top: number
	right: number
	bottom: number
	left: number
}

let probeEl: HTMLDivElement | undefined

function getProbeElement(): HTMLDivElement
{
	if (probeEl && document.body.contains(probeEl))
	{
		return probeEl
	}

	const el = document.createElement('div')
	el.style.position = 'fixed'
	el.style.top = '0'
	el.style.left = '0'
	el.style.visibility = 'hidden'
	el.style.pointerEvents = 'none'
	el.style.paddingTop = 'env(safe-area-inset-top)'
	el.style.paddingRight = 'env(safe-area-inset-right)'
	el.style.paddingBottom = 'env(safe-area-inset-bottom)'
	el.style.paddingLeft = 'env(safe-area-inset-left)'

	document.body.appendChild(el)
	probeEl = el

	return el
}

export function getSafeAreaInsetsPx(): SafeAreaInsets
{
	const el = getProbeElement()
	const style = getComputedStyle(el)

	return {
		top: parseFloat(style.paddingTop) || 0,
		right: parseFloat(style.paddingRight) || 0,
		bottom: parseFloat(style.paddingBottom) || 0,
		left: parseFloat(style.paddingLeft) || 0
	}
}
