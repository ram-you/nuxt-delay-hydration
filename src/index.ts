import { dirname, join, resolve } from 'upath'
import { defineNuxtModule, addTemplate } from '@nuxt/kit'
import { ModuleOptions } from './interfaces'
import { MODE_DELAY_APP_INIT, MODE_DELAY_APP_MOUNT, MODE_DELAY_MANUAL, NAME } from './constants'
import templateUtils from './util/template'
import logger from './logger'

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: NAME,
    configKey: 'delayHydration',
  },
  defaults: {
    mode: MODE_DELAY_APP_INIT,
    hydrateOnEvents: [
      'mousemove',
      'scroll',
      'keydown',
      'click',
      'touchstart',
      'wheel',
    ],
    postIdleTimeout: {
      mobile: 6000,
      desktop: 5000,
    },
    idleCallbackTimeout: 7000,
    forever: false,
    debug: false,
    replayLastPointerEvent: false,
    replayEventMaxAge: 2000,
  },
  setup(config, nuxt) {
    if (!config.mode) {
      logger.info(`\`${NAME}\` mode set to \`${config.mode}\`, disabling module.`)
      return
    }

    nuxt.hook('build:before', () => {
      if (process.env.NODE_ENV !== 'test')
        logger.info(`\`${NAME}\` enabled with \`${config.mode}\` mode.`)
      // enable asyncScripts
      // @ts-ignore
      nuxt.options.render.asyncScripts = true
    })

    const delayHydrationPath = join('hydration', 'hydrationRace.js')
    const replayPointerEventPath = join('hydration', 'replayPointerEvent.js')

    addTemplate({
      src: resolve(__dirname, 'template/hydrationRace.js'),
      fileName: delayHydrationPath,
      options: config,
    })

    if (config.replayLastPointerEvent) {
      addTemplate({
        src: resolve(__dirname, 'template/replayPointerEvent.js'),
        fileName: replayPointerEventPath,
        options: config,
      })
    }

    nuxt.hook('components:dirs', (dirs: {path: string; isAsync: boolean }[]) => {
      dirs.push({
        path: join(__dirname, 'components'),
        isAsync: true,
      })
    })

    if (config.mode === MODE_DELAY_MANUAL) {
      addTemplate({
        src: resolve(__dirname, 'plugin/injectDelayHydrationApi.js'),
        fileName: join('hydration', 'pluginDelayHydration.client.js'),
        options: config,
      })
    }

    const utils = templateUtils({ publishPath: join(dirname(__dirname), '.runtime') })

    if (config.mode === MODE_DELAY_APP_INIT || config.mode === MODE_DELAY_APP_MOUNT) {
      /**
       * Hook into the template builder, inject the hydration delayer module.
       */
      // @ts-ignore
      nuxt.hook('build:templates', ({ templateVars, templatesFiles }) => {
        if (config.mode === MODE_DELAY_APP_MOUNT) {
          // @ts-ignore
          const template = utils.matchTemplate(templatesFiles, 'client')
          if (!template)
            return

          templateVars.hydrationConfig = config
          // import statement
          template.injectFileContents(
            join(__dirname, 'templateInjects', 'import.js'),
            'import Vue from \'vue\'',
          )
          // actual delayer
          template.injectFileContents(
            join(__dirname, 'templateInjects', 'delayHydrationRace.js'),
            'async function mountApp (__app) {',
          )
          template.publish()
          return
        }

        if (config.mode === MODE_DELAY_APP_INIT) {
          // @ts-ignore
          const template = utils.matchTemplate(templatesFiles, 'index')
          if (!template)
            return

          templateVars.hydrationConfig = config
          // import statement
          template.injectFileContents(
            join(__dirname, 'template', 'import.js'),
            'import Vue from \'vue\'',
          )
          // actual delayer
          template.injectFileContents(
            join(__dirname, 'template', 'delayHydrationRace.js'),
            'async function createApp(ssrContext, config = {}) {',
          )
          template.publish()
        }
      })
    }
  },

})
