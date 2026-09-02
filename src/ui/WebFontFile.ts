import Phaser from 'phaser'
import WebFont from 'webfontloader'

export default class WebFontFile extends Phaser.Loader.File
{
	private fontNames: string[]
	private service: string

	constructor(loader: Phaser.Loader.LoaderPlugin, fontNames: string | string[], service = 'google')
	{
		super(loader, {
			type: 'webfont',
			key: fontNames.toString()
		})

		this.fontNames = Array.isArray(fontNames) ? fontNames : [fontNames]
		this.service = service
	}

	load()
	{
		// Si Google Fonts está bloqueado/inalcanzable en el entorno donde corre
		// el juego (ver el fix de webfont.js más abajo -- mismo problema, otro
		// dominio), `active` nunca dispara. Sin `inactive` acá, el loader de
		// Phaser queda esperando este archivo para siempre y el juego no pasa
		// nunca de la pantalla de carga -- inactive también destraba el loader,
		// simplemente sin las fuentes custom (fallback a las fuentes del
		// sistema que ya declara styles.scss).
		let settled = false

		const advance = () => {
			if (settled)
			{
				return
			}

			settled = true
			this.loader.nextFile(this, true)
		}

		const config = {
			active: advance,
			inactive: advance
		}

		switch (this.service)
		{
			case 'google':
				config['google'] = {
					families: this.fontNames
				}
				break

			default:
				throw new Error('Unsupported font service')
		}
		
		WebFont.load(config)
	}
}