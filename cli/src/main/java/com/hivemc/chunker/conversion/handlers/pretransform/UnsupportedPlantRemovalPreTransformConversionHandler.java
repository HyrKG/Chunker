package com.hivemc.chunker.conversion.handlers.pretransform;

import com.hivemc.chunker.conversion.handlers.ColumnConversionHandler;
import com.hivemc.chunker.conversion.intermediate.column.ChunkerColumn;
import com.hivemc.chunker.conversion.intermediate.column.chunk.ChunkerChunk;
import com.hivemc.chunker.conversion.intermediate.column.chunk.RegionCoordPair;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.ChunkerBlockIdentifier;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.ChunkerBlockType;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.ChunkerVanillaBlockType;
import com.hivemc.chunker.conversion.intermediate.column.chunk.palette.Palette;
import com.hivemc.chunker.conversion.intermediate.world.ChunkerWorld;

import java.util.ArrayList;
import java.util.List;

/**
 * A pre-transform handler which removes plants whose block directly below cannot sustain them in legacy Java versions
 * (1.12.2 and earlier). Such plants (flowers stacked on flowers, floating flowers, flowers on stone, etc.) trigger the
 * known {@code BlockBush.checkAndDropBlock} / {@code onNeighborChanged} recursion which crashes 1.12.2 with a
 * {@code StackOverflowError: Exception while updating neighbours} when the chunk loads.
 * <p>
 * In 1.12.2 {@code BlockBush.canBlockStay} requires the block below to sustain plants via
 * {@code canSustainPlant(...)}, which in vanilla only {@code grass}, {@code dirt} (all variants, including podzol and
 * coarse dirt) and {@code farmland} do. In contrast, modern versions allow flowers on blocks such as mycelium and moss
 * (which are part of the {@code #dirt} tag in 1.19+), and the legacy writer additionally writes modern-only blocks
 * (moss block, rooted dirt, mud, ...) as air. Both cases would leave an unsupported flower in the 1.12.2 output, so
 * this handler removes any plant in its set whose block below is not one of the legacy support blocks.
 * <p>
 * Only single-block plants with the strict soil rule are handled: small flowers, short grass / fern and saplings.
 * The following are intentionally excluded:
 * <ul>
 *     <li>Double plants (sunflower, lilac, rose bush, peony, tall grass, large fern): their upper half legitimately
 *     sits on the lower half, so they need paired top/bottom removal logic (future work).</li>
 *     <li>Crops, dead bushes, mushrooms, cactus, sugar cane: they have different support rules
 *     (farmland/sand/stone/etc.) and removing them would destroy legitimate content.</li>
 * </ul>
 * <p>
 * Unlike {@link ColumnPreTransformConversionHandler}, no neighbouring columns are required: the support check only
 * reads the block directly below, which is always inside the same column. All removals are computed before any writes
 * happen, keeping the result deterministic (removing an upper flower never changes the support of the flower below).
 */
public class UnsupportedPlantRemovalPreTransformConversionHandler implements ColumnConversionHandler {
    private final ColumnConversionHandler delegate;

    /**
     * Create a new unsupported plant removal pre transform conversion handler.
     *
     * @param delegate     the delegate to call after pre-transformation.
     * @param chunkerWorld the world being used for pre-transformation (unused: this handler only needs the current
     *                     column, but the parameter keeps the pipeline factory signature).
     */
    public UnsupportedPlantRemovalPreTransformConversionHandler(ColumnConversionHandler delegate, ChunkerWorld chunkerWorld) {
        this.delegate = delegate;
    }

    /**
     * Whether a block is one of the single-block plants with the strict 1.12.2 soil rule ({@code BlockBush} with
     * grass/dirt/farmland support only). See the class Javadoc for the exclusion rationale.
     *
     * @param block the block to check.
     * @return true if the block is a plant which requires legacy soil support.
     */
    private static boolean isUnsupportedPlant(ChunkerBlockIdentifier block) {
        ChunkerBlockType type = block.getType();
        return type == ChunkerVanillaBlockType.DANDELION
                || type == ChunkerVanillaBlockType.TORCHFLOWER
                || type == ChunkerVanillaBlockType.POPPY
                || type == ChunkerVanillaBlockType.BLUE_ORCHID
                || type == ChunkerVanillaBlockType.ALLIUM
                || type == ChunkerVanillaBlockType.AZURE_BLUET
                || type == ChunkerVanillaBlockType.RED_TULIP
                || type == ChunkerVanillaBlockType.ORANGE_TULIP
                || type == ChunkerVanillaBlockType.WHITE_TULIP
                || type == ChunkerVanillaBlockType.PINK_TULIP
                || type == ChunkerVanillaBlockType.OXEYE_DAISY
                || type == ChunkerVanillaBlockType.CORNFLOWER
                || type == ChunkerVanillaBlockType.WITHER_ROSE
                || type == ChunkerVanillaBlockType.LILY_OF_THE_VALLEY
                || type == ChunkerVanillaBlockType.SHORT_GRASS
                || type == ChunkerVanillaBlockType.FERN
                || type == ChunkerVanillaBlockType.OAK_SAPLING
                || type == ChunkerVanillaBlockType.SPRUCE_SAPLING
                || type == ChunkerVanillaBlockType.BIRCH_SAPLING
                || type == ChunkerVanillaBlockType.JUNGLE_SAPLING
                || type == ChunkerVanillaBlockType.ACACIA_SAPLING
                || type == ChunkerVanillaBlockType.DARK_OAK_SAPLING
                || type == ChunkerVanillaBlockType.CHERRY_SAPLING
                || type == ChunkerVanillaBlockType.MANGROVE_PROPAGULE
                || type == ChunkerVanillaBlockType.BAMBOO_SAPLING;
    }

    /**
     * Whether a block can sustain the handled plants in legacy Java versions (1.12.2 and earlier).
     * <p>
     * This mirrors vanilla 1.12.2: {@code BlockBush.canBlockStay} accepts exactly the blocks whose
     * {@code canSustainPlant(...)} returns true - grass, dirt (all variants, including podzol and coarse dirt) and
     * farmland. Mycelium is deliberately excluded (it does not sustain plants in 1.12.2, even though it is part of the
     * modern {@code #dirt} tag), as are modern-only blocks such as moss block and rooted dirt which the legacy writer
     * maps to air.
     *
     * @param block the block below a plant.
     * @return true if the block sustains plants in legacy Java versions.
     */
    private static boolean isValidSupport(ChunkerBlockIdentifier block) {
        ChunkerBlockType type = block.getType();
        return type == ChunkerVanillaBlockType.GRASS_BLOCK
                || type == ChunkerVanillaBlockType.DIRT
                || type == ChunkerVanillaBlockType.PODZOL
                || type == ChunkerVanillaBlockType.FARMLAND
                || type == ChunkerVanillaBlockType.COARSE_DIRT;
    }

    /**
     * Find all the handled plants inside a column, recording their global block co-ordinates.
     *
     * @param column the column to scan.
     * @return a list of {@code int[]{x, y, z}} global block co-ordinates of handled plants.
     */
    private static List<int[]> findPlants(ChunkerColumn column) {
        List<int[]> plants = new ArrayList<>();
        int chunkX = column.getPosition().chunkX() << 4;
        int chunkZ = column.getPosition().chunkZ() << 4;

        for (ChunkerChunk chunk : column.getChunks().values()) {
            Palette<ChunkerBlockIdentifier> palette = chunk.getPalette();
            if (palette == null || !palette.containsKey(UnsupportedPlantRemovalPreTransformConversionHandler::isUnsupportedPlant)) {
                continue; // Skip chunks which don't contain any handled plants
            }

            int baseY = chunk.getY() << 4;
            for (int localY = 0; localY < 16; localY++) {
                for (int localX = 0; localX < 16; localX++) {
                    for (int localZ = 0; localZ < 16; localZ++) {
                        ChunkerBlockIdentifier block = palette.get(localX, localY, localZ, ChunkerBlockIdentifier.AIR);
                        if (isUnsupportedPlant(block)) {
                            plants.add(new int[]{chunkX | localX, baseY | localY, chunkZ | localZ});
                        }
                    }
                }
            }
        }
        return plants;
    }

    @Override
    public void convertColumn(ChunkerColumn column) {
        List<int[]> plants = findPlants(column);
        if (plants.isEmpty()) {
            // No handled plants, nothing to do
            delegate.convertColumn(column);
            return;
        }

        // Compute every removal from the original block state before writing anything. Each plant's support decision
        // depends only on the block directly below it, and that block is never modified by this handler (removals only
        // replace the plants themselves with air), so the decision for a flower at y=66 sitting on a flower at y=65 is
        // identical regardless of write order. Computing first keeps the pass deterministic.
        List<int[]> removals = new ArrayList<>();
        for (int[] plant : plants) {
            ChunkerBlockIdentifier below = column.getBlock(plant[0], plant[1] - 1, plant[2]);
            if (!isValidSupport(below)) {
                removals.add(plant);
            }
        }

        // Apply the removals
        for (int[] plant : removals) {
            column.setBlock(plant[0], plant[1], plant[2], ChunkerBlockIdentifier.AIR);
        }

        // Submit to the delegate
        delegate.convertColumn(column);
    }

    @Override
    public void flushRegion(RegionCoordPair regionCoordPair) {
        delegate.flushRegion(regionCoordPair);
    }

    @Override
    public void flushColumns() {
        delegate.flushColumns();
    }
}
