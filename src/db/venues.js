const DISTANCE_SQL = `(
  6371 * acos(
    least(
      1,
      greatest(
        -1,
        cos(radians($1)) * cos(radians(v.lat::double precision)) *
        cos(radians(v.lng::double precision) - radians($2)) +
        sin(radians($1)) * sin(radians(v.lat::double precision))
      )
    )
  )
)`;

const SORT_SQL = {
  distance: 'distance_km asc',
  match: 'coalesce(vls.status_confidence, 0) desc, distance_km asc',
  trending: 'coalesce(vls.report_count_window, 0) desc, distance_km asc',
};

function buildListVenuesQuery(params) {
  const values = [params.lat, params.lng, params.radius_km];
  const where = [`v.is_active = true`, `${DISTANCE_SQL} <= $3`];

  if (params.q) {
    values.push(`%${params.q}%`);
    const qParam = `$${values.length}`;
    where.push(`(v.name ilike ${qParam} or v.slug ilike ${qParam} or coalesce(v.neighborhood, '') ilike ${qParam})`);
  }

  if (params.types?.length) {
    values.push(params.types);
    where.push(`v.canonical_type = any($${values.length}::text[])`);
  }

  if (params.tags?.length) {
    values.push(params.tags);
    where.push(`exists (
      select 1
      from venue_tags vt_filter
      where vt_filter.venue_id = v.id
        and vt_filter.tag_key = any($${values.length}::text[])
        and vt_filter.expires_at > now()
    )`);
  }

  values.push(params.limit + 1);
  const limitParam = `$${values.length}`;

  values.push(params.cursor);
  const offsetParam = `$${values.length}`;

  const text = `
    select
      v.id::text as id,
      v.name,
      v.canonical_type,
      ${DISTANCE_SQL}::double precision as distance_km,
      coalesce(vt.tags, '[]'::json) as tags,
      case
        when vls.venue_id is null then null
        else json_build_object(
          'crowd_level', vls.crowd_level,
          'line_wait_bin', vls.line_wait_bin,
          'status_confidence', vls.status_confidence,
          'updated_at', to_char(vls.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      end as live_state,
      vs.summary_short
    from venues v
    left join lateral (
      select json_agg(
        json_build_object('key', vt.tag_key, 'confidence', vt.confidence)
        order by vt.confidence desc
      ) as tags
      from venue_tags vt
      where vt.venue_id = v.id
        and vt.expires_at > now()
    ) vt on true
    left join venue_live_state vls on vls.venue_id = v.id
    left join venue_summaries vs on vs.venue_id = v.id and vs.expires_at > now()
    where ${where.join(' and ')}
    order by ${SORT_SQL[params.sort]}
    limit ${limitParam}
    offset ${offsetParam}
  `;

  return { text, values };
}

async function listVenues(pool, params) {
  const query = buildListVenuesQuery(params);
  const { rows } = await pool.query(query);
  const hasMore = rows.length > params.limit;
  const slicedRows = hasMore ? rows.slice(0, params.limit) : rows;

  return {
    items: slicedRows.map((row) => ({
      id: row.id,
      name: row.name,
      canonical_type: row.canonical_type,
      distance_km: Number(row.distance_km),
      tags: row.tags ?? [],
      live_state: row.live_state,
      summary_short: row.summary_short,
    })),
    next_cursor: hasMore ? String(params.cursor + params.limit) : null,
  };
}

async function getVenueById(pool, id) {
  const { rows } = await pool.query(
    `
      select
        v.id::text as id,
        v.name,
        json_build_object(
          'lat', v.lat::double precision,
          'lng', v.lng::double precision,
          'address', v.address
        ) as location,
        v.price_band,
        coalesce(v.music_genres, '{}'::text[]) as music_genres,
        coalesce(vt.tags, '[]'::json) as tags,
        json_build_object(
          'summary_short', vs.summary_short,
          'bullets', coalesce(vs.bullets, '[]'::jsonb),
          'confidence', vs.confidence
        ) as summary,
        case
          when vls.venue_id is null then null
          else json_build_object(
            'crowd_level', vls.crowd_level,
            'line_wait_bin', vls.line_wait_bin,
            'status_confidence', vls.status_confidence,
            'updated_at', to_char(vls.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
        end as live_state
      from venues v
      left join lateral (
        select json_agg(
          json_build_object('key', vt.tag_key, 'confidence', vt.confidence)
          order by vt.confidence desc
        ) as tags
        from venue_tags vt
        where vt.venue_id = v.id
          and vt.expires_at > now()
      ) vt on true
      left join venue_summaries vs on vs.venue_id = v.id and vs.expires_at > now()
      left join venue_live_state vls on vls.venue_id = v.id
      where v.id = $1
        and v.is_active = true
      limit 1
    `,
    [id]
  );

  if (!rows[0]) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    price_band: row.price_band,
    music_genres: row.music_genres,
    tags: row.tags ?? [],
    summary: row.summary,
    live_state: row.live_state,
  };
}

module.exports = {
  listVenues,
  getVenueById,
};
