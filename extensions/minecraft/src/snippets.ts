/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * Language help for Minecraft code: snippets (Java and Kotlin) and the common
 * API classes as completion words.
 *
 * The snippets appear through `Addon.snippets` in the completion for Java and
 * Kotlin (the prefix `mc-`) and through the command “Minecraft: insert a
 * snippet…” with a choice of platform as well.
 */

import type { Snippet } from '../../../src/core/types';

export interface McSnippet extends Snippet {
  language: 'java' | 'kotlin';
  /** The platform for the list of choices. */
  platform: string;
}

const java = (platform: string, label: string, detail: string, body: string): McSnippet => ({ language: 'java', platform, label, detail, body });
const kotlin = (platform: string, label: string, detail: string, body: string): McSnippet => ({ language: 'kotlin', platform, label, detail, body });

export const MINECRAFT_SNIPPETS: McSnippet[] = [
  /* Bukkit / Paper */
  java('Bukkit', 'mc-listener', 'Bukkit-Listener', `public final class \${Name}Listener implements Listener {
    @EventHandler
    public void on\${Event}(\${PlayerJoinEvent} event) {
        $0
    }
}`),
  java('Bukkit', 'mc-eventhandler', '@EventHandler-Methode', `@EventHandler(priority = EventPriority.\${NORMAL}, ignoreCancelled = true)
public void on\${Event}(\${PlayerInteractEvent} event) {
    $0
}`),
  java('Bukkit', 'mc-command', 'CommandExecutor + TabCompleter', `public final class \${Name}Command implements CommandExecutor, TabCompleter {
    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        $0
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        return List.of();
    }
}`),
  java('Bukkit', 'mc-plugin', 'JavaPlugin-Hauptklasse', `public final class \${Name} extends JavaPlugin {
    @Override
    public void onEnable() {
        $0
    }

    @Override
    public void onDisable() {
    }
}`),
  java('Bukkit', 'mc-scheduler', 'Wiederholte Aufgabe (Scheduler)', `getServer().getScheduler().runTaskTimer(this, () -> {
    $0
}, \${0}L, \${20}L);`),
  java('Paper', 'mc-brigadier', 'Paper-Brigadier-Befehl (LifecycleEvents)', `getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, event -> {
    event.registrar().register(Commands.literal("\${name}")
        .requires(source -> source.getSender().hasPermission("\${plugin}.\${name}"))
        .executes(ctx -> {
            ctx.getSource().getSender().sendMessage(Component.text("$0"));
            return Command.SINGLE_SUCCESS;
        })
        .build(), "\${Beschreibung}");
});`),
  java('Paper', 'mc-minimessage', 'MiniMessage-Text', 'Component ${text} = MiniMessage.miniMessage().deserialize("<${green}>$0");'),
  java('Paper', 'mc-pdc', 'PersistentDataContainer', `NamespacedKey \${key} = new NamespacedKey(plugin, "\${name}");
\${item}.editPersistentDataContainer(pdc -> pdc.set(\${key}, PersistentDataType.\${STRING}, $0));`),

  /* Velocity */
  java('Velocity', 'mc-velocity-plugin', 'Velocity-@Plugin-Klasse', `@Plugin(id = "\${id}", name = "\${Name}", version = "\${1.0.0}")
public final class \${Name}Plugin {
    private final ProxyServer server;
    private final Logger logger;

    @Inject
    public \${Name}Plugin(ProxyServer server, Logger logger) {
        this.server = server;
        this.logger = logger;
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
        $0
    }
}`),
  java('Velocity', 'mc-subscribe', 'Velocity @Subscribe', `@Subscribe
public void on\${Event}(\${PostLoginEvent} event) {
    $0
}`),
  java('Velocity', 'mc-velocity-command', 'Velocity-BrigadierCommand', `BrigadierCommand \${command} = new BrigadierCommand(
    BrigadierCommand.literalArgumentBuilder("\${name}")
        .executes(ctx -> {
            ctx.getSource().sendMessage(Component.text("$0"));
            return Command.SINGLE_SUCCESS;
        }));
server.getCommandManager().register(server.getCommandManager().metaBuilder(\${command}).plugin(this).build(), \${command});`),

  /* BungeeCord */
  java('BungeeCord', 'mc-bungee-listener', 'BungeeCord-Listener', `public final class \${Name}Listener implements Listener {
    @EventHandler
    public void on\${Event}(\${PostLoginEvent} event) {
        $0
    }
}`),
  java('BungeeCord', 'mc-bungee-command', 'BungeeCord-Befehl', `public final class \${Name}Command extends Command {
    public \${Name}Command() {
        super("\${name}", "\${permission}");
    }

    @Override
    public void execute(CommandSender sender, String[] args) {
        $0
    }
}`),

  /* Fabric / Quilt */
  java('Fabric', 'mc-fabric-init', 'Fabric ModInitializer', `public class \${Name} implements ModInitializer {
    public static final String MOD_ID = "\${modid}";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        $0
    }
}`),
  java('Fabric', 'mc-fabric-client', 'Fabric ClientModInitializer', `public class \${Name}Client implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        $0
    }
}`),
  java('Fabric', 'mc-fabric-command', 'Fabric CommandRegistrationCallback', `CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) ->
    dispatcher.register(Commands.literal("\${name}").executes(ctx -> {
        ctx.getSource().sendSuccess(() -> Component.literal("$0"), false);
        return 1;
    })));`),
  java('Fabric', 'mc-fabric-event', 'Fabric-Event registrieren', `\${ServerLifecycleEvents}.\${SERVER_STARTED}.register(\${server} -> {
    $0
});`),
  java('Fabric', 'mc-fabric-item', 'Item registrieren (Registry.register)', `public static final Item \${EXAMPLE_ITEM} = Registry.register(
    BuiltInRegistries.ITEM,
    ResourceKey.create(Registries.ITEM, Identifier.fromNamespaceAndPath(MOD_ID, "\${example_item}")),
    new Item(new Item.Properties().setId(ResourceKey.create(Registries.ITEM, Identifier.fromNamespaceAndPath(MOD_ID, "\${example_item}"))))$0
);`),

  /* Mixin */
  java('Mixin', 'mc-mixin', 'Mixin class with @Inject', `@Mixin(\${MinecraftServer}.class)
public abstract class \${Name}Mixin {
    @Inject(method = "\${methodName}", at = @At("\${HEAD}"))
    private void \${onMethod}(CallbackInfo info) {
        $0
    }
}`),
  java('Mixin', 'mc-accessor', 'Mixin-@Accessor-Interface', `@Mixin(\${Target}.class)
public interface \${Target}Accessor {
    @Accessor("\${field}")
    \${Type} \${getField}();$0
}`),
  java('Mixin', 'mc-inject-return', 'Mixin @Inject with return value', `@Inject(method = "\${methodName}", at = @At("RETURN"), cancellable = true)
private void \${onReturn}(CallbackInfoReturnable<\${Boolean}> cir) {
    $0
}`),

  /* NeoForge */
  java('NeoForge', 'mc-neoforge-mod', 'NeoForge @Mod-Klasse', `@Mod(\${Name}.MOD_ID)
public final class \${Name} {
    public static final String MOD_ID = "\${modid}";
    public static final Logger LOGGER = LogUtils.getLogger();

    public \${Name}(IEventBus modEventBus, ModContainer modContainer) {
        modEventBus.addListener(this::commonSetup);
        $0
    }

    private void commonSetup(FMLCommonSetupEvent event) {
    }
}`),
  java('NeoForge', 'mc-neoforge-subscriber', 'NeoForge @EventBusSubscriber', `@EventBusSubscriber(modid = \${Name}.MOD_ID)
public final class \${Events} {
    @SubscribeEvent
    public static void on\${Event}(\${ServerStartingEvent} event) {
        $0
    }
}`),
  java('NeoForge', 'mc-neoforge-deferred', 'NeoForge DeferredRegister (items/blocks)', `public static final DeferredRegister.Items ITEMS = DeferredRegister.createItems(MOD_ID);
public static final DeferredRegister.Blocks BLOCKS = DeferredRegister.createBlocks(MOD_ID);

public static final DeferredItem<Item> \${EXAMPLE_ITEM} = ITEMS.registerSimpleItem("\${example_item}");
public static final DeferredBlock<Block> \${EXAMPLE_BLOCK} = BLOCKS.registerSimpleBlock("\${example_block}");$0`),
  java('NeoForge', 'mc-neoforge-commands', 'NeoForge RegisterCommandsEvent', `NeoForge.EVENT_BUS.addListener((RegisterCommandsEvent event) ->
    event.getDispatcher().register(Commands.literal("\${name}").executes(ctx -> {
        ctx.getSource().sendSuccess(() -> Component.literal("$0"), false);
        return 1;
    })));`),

  /* Forge */
  java('Forge', 'mc-forge-mod', 'Forge @Mod-Klasse (EventBus 7)', `@Mod(\${Name}.MOD_ID)
public final class \${Name} {
    public static final String MOD_ID = "\${modid}";

    public \${Name}(FMLJavaModLoadingContext context) {
        var modBusGroup = context.getModBusGroup();
        FMLCommonSetupEvent.getBus(modBusGroup).addListener(this::commonSetup);
        $0
    }

    private void commonSetup(FMLCommonSetupEvent event) {
    }
}`),
  java('Forge', 'mc-forge-register', 'Forge DeferredRegister + RegistryObject', `public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, MOD_ID);

public static final RegistryObject<Item> \${EXAMPLE_ITEM} = ITEMS.register("\${example_item}",
    () -> new Item(new Item.Properties().setId(ITEMS.key("\${example_item}"))));$0`),
  java('Forge', 'mc-forge-listener', 'Forge-Event-Listener (EventBus 7)', `\${ServerStartingEvent}.BUS.addListener(\${Name}::on\${Event});

private static void on\${Event}(\${ServerStartingEvent} event) {
    $0
}`),

  /* Kotlin */
  kotlin('Bukkit', 'mc-listener', 'Bukkit-Listener (Kotlin)', `class \${Name}Listener : Listener {
    @EventHandler
    fun on\${Event}(event: \${PlayerJoinEvent}) {
        $0
    }
}`),
  kotlin('Bukkit', 'mc-plugin', 'JavaPlugin-Hauptklasse (Kotlin)', `class \${Name} : JavaPlugin() {
    override fun onEnable() {
        $0
    }
}`),
  kotlin('Velocity', 'mc-subscribe', 'Velocity @Subscribe (Kotlin)', `@Subscribe
fun on\${Event}(event: \${PostLoginEvent}) {
    $0
}`),
  kotlin('Fabric', 'mc-fabric-init', 'Fabric ModInitializer (Kotlin)', `object \${Name} : ModInitializer {
    const val MOD_ID = "\${modid}"
    private val logger = LoggerFactory.getLogger(MOD_ID)

    override fun onInitialize() {
        $0
    }
}`),
  kotlin('Mixin', 'mc-mixin', 'Mixin-Klasse (Kotlin)', `@Mixin(\${MinecraftServer}::class)
abstract class \${Name}Mixin {
    @Inject(method = ["\${methodName}"], at = [At("HEAD")])
    private fun \${onMethod}(info: CallbackInfo) {
        $0
    }
}`),
  kotlin('NeoForge', 'mc-neoforge-mod', 'NeoForge @Mod-Klasse (Kotlin)', `@Mod(\${Name}.MOD_ID)
class \${Name}(modEventBus: IEventBus) {
    companion object {
        const val MOD_ID = "\${modid}"
    }

    init {
        $0
    }
}`),
];

/** The common API classes and methods for the completion. */
export const MINECRAFT_COMPLETIONS = [
  // Bukkit / Paper
  'JavaPlugin', 'Listener', 'EventHandler', 'EventPriority', 'CommandExecutor', 'TabCompleter', 'CommandSender',
  'PluginCommand', 'Player', 'Bukkit', 'Server', 'World', 'Location', 'Material', 'ItemStack', 'ItemMeta',
  'NamespacedKey', 'PersistentDataType', 'PlayerJoinEvent', 'PlayerQuitEvent', 'PlayerInteractEvent',
  'BlockBreakEvent', 'BlockPlaceEvent', 'EntityDamageEvent', 'AsyncChatEvent', 'BukkitRunnable', 'FileConfiguration',
  'LifecycleEvents', 'Commands', 'CommandSourceStack', 'Component', 'MiniMessage', 'NamedTextColor',
  'getServer', 'getPluginManager', 'registerEvents', 'getLifecycleManager', 'saveDefaultConfig', 'getConfig',
  // Velocity / BungeeCord
  'ProxyServer', 'ProxyInitializeEvent', 'PostLoginEvent', 'Subscribe', 'BrigadierCommand', 'CommandSource',
  'DataDirectory', 'ProxiedPlayer', 'TextComponent', 'TabExecutor', 'Plugin',
  // Brigadier
  'CommandDispatcher', 'LiteralArgumentBuilder', 'RequiredArgumentBuilder', 'StringArgumentType', 'IntegerArgumentType',
  // Fabric / Quilt
  'ModInitializer', 'ClientModInitializer', 'DedicatedServerModInitializer', 'DataGeneratorEntrypoint',
  'CommandRegistrationCallback', 'ServerLifecycleEvents', 'ServerTickEvents', 'ClientTickEvents', 'UseBlockCallback',
  'PlayerBlockBreakEvents', 'FabricDataGenerator', 'ItemGroupEvents',
  // Minecraft (the Mojang names)
  'MinecraftServer', 'ServerPlayer', 'ServerLevel', 'Level', 'BlockPos', 'BlockState', 'Blocks', 'Block', 'Item',
  'Items', 'ItemStack', 'BuiltInRegistries', 'Registries', 'Registry', 'ResourceKey', 'Identifier', 'ResourceLocation',
  'CreativeModeTab', 'CreativeModeTabs', 'Entity', 'LivingEntity', 'EntityType', 'InteractionHand', 'InteractionResult',
  // Mixin
  'Mixin', 'Inject', 'At', 'CallbackInfo', 'CallbackInfoReturnable', 'Accessor', 'Invoker', 'Shadow', 'Overwrite',
  'ModifyVariable', 'ModifyArg', 'Redirect', 'Unique',
  // NeoForge / Forge
  'Mod', 'IEventBus', 'ModContainer', 'EventBusSubscriber', 'SubscribeEvent', 'DeferredRegister', 'DeferredItem',
  'DeferredBlock', 'DeferredHolder', 'NeoForge', 'FMLCommonSetupEvent', 'FMLClientSetupEvent', 'RegisterCommandsEvent',
  'ServerStartingEvent', 'GatherDataEvent', 'BuildCreativeModeTabContentsEvent', 'ModConfigSpec', 'Dist',
  'FMLJavaModLoadingContext', 'ForgeRegistries', 'RegistryObject', 'ForgeConfigSpec',
];
