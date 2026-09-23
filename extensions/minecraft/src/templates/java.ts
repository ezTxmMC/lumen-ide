/** Java code the mod templates share: a Brigadier command, an example mixin, the lang file. */

import type { FormValues } from '../../../../src/core/types'
import { mixinLevel } from '../eras'
import { t } from '../lumen'
import { javaHeader, javaText, json } from './common'

/**
 * `/hello [name]` with Mojang's names — the same on every loader from 1.20
 * (`Component.literal`, `sendSuccess(Supplier, …)`).
 */
export function vanillaCommand(pkg: string): string {
  return `${javaHeader(`${pkg}.command`, [
    'com.mojang.brigadier.CommandDispatcher',
    'com.mojang.brigadier.arguments.StringArgumentType',
    'net.minecraft.commands.CommandSourceStack',
    'net.minecraft.commands.Commands',
    'net.minecraft.network.chat.Component',
  ])}/** /hello [name] */
public final class HelloCommand {
    private HelloCommand() {
    }

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("hello")
            .executes(ctx -> {
                ctx.getSource().sendSuccess(() -> Component.literal("${javaText(t('code.hello'))}"), false);
                return 1;
            })
            .then(Commands.argument("name", StringArgumentType.word())
                .executes(ctx -> {
                    String name = StringArgumentType.getString(ctx, "name");
                    ctx.getSource().sendSuccess(() -> Component.literal("${javaText(t('code.helloName'))}".replace("%name%", name)), false);
                    return 1;
                })));
    }
}
`
}

/** An example mixin with Mojang's names: runs before the world is loaded. */
export function exampleMixin(pkg: string): string {
  return `${javaHeader(`${pkg}.mixin`, [
    'net.minecraft.server.MinecraftServer',
    'org.spongepowered.asm.mixin.Mixin',
    'org.spongepowered.asm.mixin.injection.At',
    'org.spongepowered.asm.mixin.injection.Inject',
    'org.spongepowered.asm.mixin.injection.callback.CallbackInfo',
  ])}@Mixin(MinecraftServer.class)
public abstract class ExampleMixin {
    @Inject(method = "loadLevel", at = @At("HEAD"))
    private void beforeLoadLevel(CallbackInfo info) {
        // ${t('code.mixinComment')}
    }
}
`
}

export function mixinConfig(pkg: string, mc: string): string {
  return json({
    required: true,
    package: `${pkg}.mixin`,
    compatibilityLevel: mixinLevel(mc),
    mixins: ['ExampleMixin'],
    client: [],
    injectors: { defaultRequire: 1 },
    overwrites: { requireAnnotations: true },
  })
}

export function langFile(values: FormValues): string {
  return json({ [`item.${values.modId}.example_item`]: 'Example Item' })
}

/** The logger line of a mod's main class — slf4j where the game ships it, log4j before. */
export function loggerField(slf4j: boolean, visibility = 'public'): { imports: string[]; line: string } {
  if (slf4j) {
    return {
      imports: ['org.slf4j.Logger', 'org.slf4j.LoggerFactory'],
      line: `    ${visibility} static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);`,
    }
  }
  return {
    imports: ['org.apache.logging.log4j.LogManager', 'org.apache.logging.log4j.Logger'],
    line: `    ${visibility} static final Logger LOGGER = LogManager.getLogger(MOD_ID);`,
  }
}
