package com.hivemc.chunker.conversion.handlers.pretransform;

import com.hivemc.chunker.conversion.handlers.ColumnConversionHandler;
import com.hivemc.chunker.conversion.intermediate.column.ChunkerColumn;
import com.hivemc.chunker.conversion.intermediate.column.chunk.ChunkerChunk;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.ChunkerBlockIdentifier;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.ChunkerVanillaBlockType;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.states.vanilla.VanillaBlockStates;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.states.vanilla.types.Bool;
import com.hivemc.chunker.conversion.intermediate.column.chunk.palette.Palette;
import com.hivemc.chunker.conversion.intermediate.world.ChunkerWorld;

import java.util.*;

/**
 * A pre-transform handler which replaces aquatic plants (seagrass, kelp, sea pickles, frogspawn, live coral plants and
 * fans) with water when any of their six neighbouring blocks is water. This is used to fix air pockets left in water
 * after downgrading to older versions which don't support these blocks.
 * <p>
 * A neighbour counts as "water" if it is a {@link ChunkerVanillaBlockType#WATER} block, a bubble column (which is
 * effectively water), or any block carrying the {@code waterlogged=true} state. The waterlogged case is important
 * because in Minecraft 1.13+ seagrass and kelp are themselves waterlogged blocks, so a plant in the middle of a dense
 * patch is surrounded by other waterlogged plants rather than by open {@code WATER} blocks.
 * <p>
 * Like {@link ColumnPreTransformConversionHandler}, this handler holds columns which need neighbouring columns (those
 * with aquatic plants on the chunk border) until the neighbours are available, then transforms the resulting cluster.
 * Within a cluster all replacements are computed from the original block state before any writes happen, preventing a
 * replaced plant from cascading into other plants in the same round.
 * <p>
 * Plants which are not on the chunk border (their six neighbours are all inside the same column) are handled inline in
 * {@link #convertColumn(ChunkerColumn)} before delegating, since no neighbouring column is required.
 */
public class AquaticPlantWaterReplacementPreTransformConversionHandler extends ColumnPreTransformConversionHandler {
    /**
     * The block written in place of an aquatic plant. A plain water source block (liquid level 0, not flowing).
     */
    private static final ChunkerBlockIdentifier WATER = new ChunkerBlockIdentifier(ChunkerVanillaBlockType.WATER);

    /**
     * The six relative offsets used to check a plant's neighbours: the four horizontal directions plus up and down.
     * Each entry is {@code {dx, dy, dz}}.
     */
    private static final int[][] NEIGHBOUR_OFFSETS = {
            {1, 0, 0}, {-1, 0, 0}, // +x / -x
            {0, 1, 0}, {0, -1, 0}, // +y / -y
            {0, 0, 1}, {0, 0, -1}  // +z / -z
    };

    /**
     * Create a new aquatic plant water replacement pre transform conversion handler.
     *
     * @param delegate     the delegate to call after pre-transformation.
     * @param chunkerWorld the world being used for pre-transformation, used for tracking which regions have been
     *                     processed.
     */
    public AquaticPlantWaterReplacementPreTransformConversionHandler(ColumnConversionHandler delegate, ChunkerWorld chunkerWorld) {
        super(delegate, chunkerWorld);
    }

    /**
     * Whether a block is one of the aquatic plants which should be replaced with water.
     * <p>
     * This covers seagrass, kelp, sea pickles, frogspawn, live coral plants and live coral fans - underwater blocks
     * which don't exist in older versions and would otherwise leave air pockets. Bubble columns are intentionally
     * excluded: they are treated as water by {@link #isWater(ChunkerBlockIdentifier)} (so a plant next to a bubble
     * column is replaced) but are not themselves replaced. Dead coral (plants and fans) is also intentionally excluded:
     * it is a decorative block (grey) which a player may have placed and waterlogged on purpose, so replacing it would
     * destroy player-built content.
     *
     * @param block the block to check.
     * @return true if the block is an aquatic plant which should be replaced.
     */
    private static boolean isAquaticPlant(ChunkerBlockIdentifier block) {
        return block.getType() == ChunkerVanillaBlockType.SEAGRASS
                || block.getType() == ChunkerVanillaBlockType.TALL_SEAGRASS
                || block.getType() == ChunkerVanillaBlockType.KELP
                || block.getType() == ChunkerVanillaBlockType.KELP_PLANT
                || block.getType() == ChunkerVanillaBlockType.SEA_PICKLE
                || block.getType() == ChunkerVanillaBlockType.FROGSPAWN
                // Live coral plants (the plant-like form, e.g. fire coral). Dead coral is excluded (see Javadoc above).
                || block.getType() == ChunkerVanillaBlockType.TUBE_CORAL
                || block.getType() == ChunkerVanillaBlockType.BRAIN_CORAL
                || block.getType() == ChunkerVanillaBlockType.BUBBLE_CORAL
                || block.getType() == ChunkerVanillaBlockType.FIRE_CORAL
                || block.getType() == ChunkerVanillaBlockType.HORN_CORAL
                // Live coral fans (floor and wall). Dead coral fans are excluded (see Javadoc above).
                || block.getType() == ChunkerVanillaBlockType.TUBE_CORAL_FAN
                || block.getType() == ChunkerVanillaBlockType.BRAIN_CORAL_FAN
                || block.getType() == ChunkerVanillaBlockType.BUBBLE_CORAL_FAN
                || block.getType() == ChunkerVanillaBlockType.FIRE_CORAL_FAN
                || block.getType() == ChunkerVanillaBlockType.HORN_CORAL_FAN
                || block.getType() == ChunkerVanillaBlockType.TUBE_CORAL_WALL_FAN
                || block.getType() == ChunkerVanillaBlockType.BRAIN_CORAL_WALL_FAN
                || block.getType() == ChunkerVanillaBlockType.BUBBLE_CORAL_WALL_FAN
                || block.getType() == ChunkerVanillaBlockType.FIRE_CORAL_WALL_FAN
                || block.getType() == ChunkerVanillaBlockType.HORN_CORAL_WALL_FAN;
    }

    /**
     * Whether a block counts as water for the purposes of replacing an aquatic plant.
     * <p>
     * A block counts as water if it is
     * <ul>
     *     <li>a {@link ChunkerVanillaBlockType#WATER} block (source or flowing), or</li>
     *     <li>a {@link ChunkerVanillaBlockType#BUBBLE_COLUMN} (effectively water), or</li>
     *     <li>any block carrying the {@code waterlogged=true} state.</li>
     * </ul>
     * The waterlogged case is essential: in Minecraft 1.13+ seagrass and kelp are themselves waterlogged, so a plant
     * surrounded by other aquatic plants has no open {@code WATER} neighbour but is nonetheless sitting in water.
     * <p>
     * {@code getState(WATERLOGGED)} returns the state's default ({@link Bool#FALSE}) for block types which don't declare
     * the {@code waterlogged} state, so non-waterloggable blocks are never misidentified as water.
     *
     * @param block the block to check.
     * @return true if the block counts as water.
     */
    private static boolean isWater(ChunkerBlockIdentifier block) {
        if (block.getType() == ChunkerVanillaBlockType.WATER) return true;
        if (block.getType() == ChunkerVanillaBlockType.BUBBLE_COLUMN) return true;
        return block.getState(VanillaBlockStates.WATERLOGGED) == Bool.TRUE;
    }

    /**
     * Find all the aquatic plants inside a column, recording their global block co-ordinates.
     *
     * @param column the column to scan.
     * @return a list of {@code int[]{x, y, z}} global block co-ordinates of aquatic plants.
     */
    private static List<int[]> findAquaticPlants(ChunkerColumn column) {
        List<int[]> plants = new ArrayList<>();
        int chunkX = column.getPosition().chunkX() << 4;
        int chunkZ = column.getPosition().chunkZ() << 4;

        for (ChunkerChunk chunk : column.getChunks().values()) {
            Palette<ChunkerBlockIdentifier> palette = chunk.getPalette();
            if (palette == null || !palette.containsKey(AquaticPlantWaterReplacementPreTransformConversionHandler::isAquaticPlant)) {
                continue; // Skip chunks which don't contain any aquatic plants
            }

            int baseY = chunk.getY() << 4;
            for (int localY = 0; localY < 16; localY++) {
                for (int localX = 0; localX < 16; localX++) {
                    for (int localZ = 0; localZ < 16; localZ++) {
                        ChunkerBlockIdentifier block = palette.get(localX, localY, localZ, ChunkerBlockIdentifier.AIR);
                        if (isAquaticPlant(block)) {
                            plants.add(new int[]{chunkX | localX, baseY | localY, chunkZ | localZ});
                        }
                    }
                }
            }
        }
        return plants;
    }

    /**
     * Calculate the edges required by a column to be able to check the neighbours of its border aquatic plants.
     *
     * @param plants the aquatic plants found in the column (global co-ordinates).
     * @return the set of edges required, empty if no plant is on a border.
     */
    private static Set<Edge> calculateRequiredEdges(List<int[]> plants) {
        EnumSet<Edge> edges = EnumSet.noneOf(Edge.class);
        for (int[] plant : plants) {
            int localX = plant[0] & 15;
            int localZ = plant[2] & 15;
            if (localX == 0) edges.add(Edge.NEGATIVE_X);
            if (localX == 15) edges.add(Edge.POSITIVE_X);
            if (localZ == 0) edges.add(Edge.NEGATIVE_Z);
            if (localZ == 15) edges.add(Edge.POSITIVE_Z);
        }
        return edges;
    }

    /**
     * Get the block neighbouring a position inside a column, or from one of the resolved neighbour columns if the
     * position falls outside the current column. Missing neighbours (null) are treated as air.
     *
     * @param column     the column the plant is inside.
     * @param neighbours the resolved neighbour columns keyed by edge.
     * @param x          the global block X of the plant.
     * @param y          the global block Y of the plant.
     * @param z          the global block Z of the plant.
     * @param dx         the X offset to the neighbour.
     * @param dy         the Y offset to the neighbour.
     * @param dz         the Z offset to the neighbour.
     * @return the neighbouring block, or air if it couldn't be found.
     */
    private static ChunkerBlockIdentifier getNeighbourBlock(ChunkerColumn column, Map<Edge, ChunkerColumn> neighbours, int x, int y, int z, int dx, int dy, int dz) {
        int targetX = x + dx;
        int targetZ = z + dz;

        // Y neighbours never cross a column border
        if (dx == 0 && dz == 0) {
            return column.getBlock(targetX, y + dy, targetZ);
        }

        // Determine whether the horizontal neighbour falls inside the same column or an adjacent one
        int currentChunkX = column.getPosition().chunkX();
        int currentChunkZ = column.getPosition().chunkZ();
        int targetChunkX = targetX >> 4;
        int targetChunkZ = targetZ >> 4;

        if (targetChunkX == currentChunkX && targetChunkZ == currentChunkZ) {
            // Same column, getBlock applies the local bitmask itself
            return column.getBlock(targetX, y + dy, targetZ);
        }

        // Find the edge for the adjacent column
        Edge edge = Edge.fromOffset(Integer.signum(targetChunkX - currentChunkX), Integer.signum(targetChunkZ - currentChunkZ));
        if (edge == null) {
            // Diagonal neighbours aren't supported (no edge), treat as air
            return ChunkerBlockIdentifier.AIR;
        }

        ChunkerColumn neighbour = neighbours.get(edge);
        if (neighbour == null) {
            // Missing neighbour, treat as air (not water)
            return ChunkerBlockIdentifier.AIR;
        }
        return neighbour.getBlock(targetX, y + dy, targetZ);
    }

    /**
     * Whether an aquatic plant at the given position touches water on any of its six faces.
     *
     * @param column     the column the plant is inside.
     * @param neighbours the resolved neighbour columns keyed by edge.
     * @param x          the global block X of the plant.
     * @param y          the global block Y of the plant.
     * @param z          the global block Z of the plant.
     * @return true if any of the six neighbours is water.
     */
    private static boolean touchesWater(ChunkerColumn column, Map<Edge, ChunkerColumn> neighbours, int x, int y, int z) {
        for (int[] offset : NEIGHBOUR_OFFSETS) {
            ChunkerBlockIdentifier neighbour = getNeighbourBlock(column, neighbours, x, y, z, offset[0], offset[1], offset[2]);
            if (isWater(neighbour)) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void convertColumn(ChunkerColumn column) {
        List<int[]> plants = findAquaticPlants(column);
        if (plants.isEmpty()) {
            // No aquatic plants, nothing to do
            super.convertColumn(column);
            return;
        }

        // Calculate the edges required to check the neighbours of any border plants (those on the x/z chunk edge).
        Set<Edge> requiredEdges = calculateRequiredEdges(plants);

        if (requiredEdges.isEmpty()) {
            // No border plants: every plant's six neighbours are inside this column, so they can be handled now
            // without needing neighbouring columns. All replacements are computed before any writes so a plant
            // replaced with water doesn't influence another plant's decision in the same round (no cascading).
            List<int[]> replacements = new ArrayList<>();
            for (int[] plant : plants) {
                if (touchesWater(column, Collections.emptyMap(), plant[0], plant[1], plant[2])) {
                    replacements.add(plant);
                }
            }
            for (int[] plant : replacements) {
                column.setBlock(plant[0], plant[1], plant[2], WATER);
            }

            // Submit normally (the column is still in its original state with respect to the parent handler)
            super.convertColumn(column);
        } else {
            // There are border plants which need neighbouring columns. Don't apply any replacement here - the column
            // is left unmodified so that transformCluster can compute every replacement (border and interior) from
            // the original block state, guaranteeing no cascading within the cluster.
            column.addPreTransformHandler(requiredEdges, (neighbours) -> {
                // The border-plant replacement is performed centrally in transformCluster (compute-before-write), so
                // nothing to do here.
            });

            // Hand off to the parent which will read getRequiredPreTransformEdges() and solve the cluster
            super.convertColumn(column);
        }
    }

    @Override
    protected void transformCluster(Collection<ColumnData> cluster) {
        // Compute every plant replacement (border and interior) across the whole cluster using the original block
        // state, then apply them all before submitting. This guarantees a plant replaced with water doesn't influence
        // another plant's decision in the same round (no cascading, both within a column and across the cluster).
        List<Runnable> pendingWrites = new ArrayList<>();

        for (ColumnData columnData : cluster) {
            // Columns without required edges have no border plants; their replacements were already applied in
            // convertColumn. Skip them here to avoid re-evaluating against the now-modified state (which would
            // cascade).
            if (columnData.getRequiredColumns().isEmpty()) {
                continue;
            }

            ChunkerColumn column = columnData.getColumn();

            // Build the resolved neighbour map (missing/null values are treated as air by getNeighbourBlock)
            Map<Edge, ChunkerColumn> neighbours = new EnumMap<>(Edge.class);
            for (Map.Entry<Edge, ColumnData> entry : columnData.getRequiredColumns().entrySet()) {
                if (entry.getValue() != null) {
                    neighbours.put(entry.getKey(), entry.getValue().getColumn());
                }
            }

            // Evaluate every plant in the column. These columns were left unmodified by convertColumn, so all reads
            // see the original block state. All reads happen before any writes are applied, so each plant's decision is
            // based on the original block state (no cascading within the column or across the cluster).
            for (int[] plant : findAquaticPlants(column)) {
                if (touchesWater(column, neighbours, plant[0], plant[1], plant[2])) {
                    pendingWrites.add(() -> column.setBlock(plant[0], plant[1], plant[2], WATER));
                }
            }
        }

        // Apply all the writes (compute-before-write to prevent cascading within the cluster)
        for (Runnable write : pendingWrites) {
            write.run();
        }

        // Hand off to the parent to run any registered pre-transform handlers and submit the columns
        super.transformCluster(cluster);
    }
}
