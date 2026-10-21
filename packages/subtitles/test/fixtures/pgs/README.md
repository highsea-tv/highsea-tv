# A PGS track's timings

`show-frames.json` is what ffprobe reports for a Blu-ray's PGS (`hdmv_pgs_subtitle`) stream: when each display set starts and ends, and how many pictures it shows. The image-reference tests read it, so they cover a real disc's quirks without shipping one.

It holds timings only: no picture, text or other part of the film.

```sh
ffprobe -v error -select_streams <index> -show_entries subtitle=pts_time,start_display_time,end_display_time,num_rects -of json <file>
```

It came from the PGS stream of a Blu-ray remux of a commercial film, at absolute stream index 7, read without changing the file. The quirks the tests rely on:

- an end of `4294967295` (no end given), so the next display set closes the cue;
- an empty display set (`num_rects` 0), which clears the picture;
- the first cue spans 87.296 s to 89.298 s.

| File | Size | SHA-256 |
| --- | --- | --- |
| `show-frames.json` | 5,041 bytes | `fc0524f7db6f149d4da7f105bf75c093cb16eef6f7bc791dea6f7ad657ef4812` |
