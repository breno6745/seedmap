#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten/emscripten.h>

#include "generator.h"
#include "finders.h"

static Generator generator;
static uint64_t world_seed = 0;
static int ready = 0;

EMSCRIPTEN_KEEPALIVE
int set_seed(uint32_t high, uint32_t low)
{
    world_seed = ((uint64_t)high << 32) | (uint64_t)low;

    if (!ready)
    {
        setupGenerator(&generator, MC_1_8, 0);
        ready = 1;
    }

    applySeed(&generator, DIM_OVERWORLD, world_seed);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int fill_biomes(int scale, int x, int z, int width, int height, int *output)
{
    if (!ready || !output || width <= 0 || height <= 0)
        return 0;

    Range range;
    memset(&range, 0, sizeof(range));
    range.scale = scale;
    range.x = x;
    range.z = z;
    range.sx = width;
    range.sz = height;
    range.y = (scale == 1) ? 63 : 15;
    range.sy = 1;

    int *cache = allocCache(&generator, range);
    if (!cache)
        return 0;

    int result = genBiomes(&generator, cache, range);
    if (result == 0)
        memcpy(output, cache, (size_t)width * (size_t)height * sizeof(int));

    free(cache);
    return result == 0;
}

EMSCRIPTEN_KEEPALIVE
int biome_at(int scale, int x, int z)
{
    if (!ready)
        return -1;

    return getBiomeAt(&generator, scale, x, 63, z);
}

EMSCRIPTEN_KEEPALIVE
int get_structure_region_size(int structure_type)
{
    StructureConfig config;
    if (!getStructureConfig(structure_type, MC_1_8, &config))
        return 0;

    return config.regionSize;
}

EMSCRIPTEN_KEEPALIVE
int get_structure(int structure_type, int region_x, int region_z, int *output)
{
    if (!ready || !output)
        return 0;

    Pos position;
    if (!getStructurePos(structure_type, MC_1_8, world_seed,
                         region_x, region_z, &position))
        return 0;

    if (!isViableStructurePos(structure_type, &generator,
                              position.x, position.z, 0))
        return 0;

    output[0] = position.x;
    output[1] = position.z;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int fill_strongholds(int maximum, int *output)
{
    if (!ready || !output || maximum <= 0)
        return 0;

    StrongholdIter iterator;
    initFirstStronghold(&iterator, MC_1_8, world_seed);

    int count = 0;
    while (count < maximum)
    {
        int remaining = nextStronghold(&iterator, &generator);
        if (remaining < 0)
            break;

        output[count * 2] = iterator.pos.x;
        output[count * 2 + 1] = iterator.pos.z;
        count++;

        if (remaining == 0)
            break;
    }

    return count;
}

EMSCRIPTEN_KEEPALIVE
int get_world_spawn(int *output)
{
    if (!ready || !output)
        return 0;

    Pos spawn = getSpawn(&generator);

    output[0] = spawn.x;
    output[1] = spawn.z;

    return 1;
}

EMSCRIPTEN_KEEPALIVE
int fill_mineshafts(int chunk_x, int chunk_z, int chunk_w, int chunk_h,
                    int maximum, int *output)
{
    if (!ready || !output || maximum <= 0 || chunk_w <= 0 || chunk_h <= 0)
        return 0;

    Pos *positions = (Pos *) malloc((size_t) maximum * sizeof(Pos));
    if (!positions)
        return 0;

    int count = getMineshafts(
        MC_1_8,
        world_seed,
        chunk_x,
        chunk_z,
        chunk_w,
        chunk_h,
        positions,
        maximum
    );

    if (count > maximum)
        count = maximum;

    for (int i = 0; i < count; i++)
    {
        /*
         * getMineshafts retorna a posição em chunks.
         * Marcamos o centro do chunk em coordenadas de blocos.
         */
        output[i * 2] = positions[i].x * 16 + 8;
        output[i * 2 + 1] = positions[i].z * 16 + 8;
    }

    free(positions);
    return count;
}
