# Archive fixtures

Small archives for the extraction tests (`test/shared/extract.test.ts`), taken from libarchive's
own test suite.

- **Source:** https://github.com/libarchive/libarchive, `libarchive/test/*.uu`
- **Commit:** `03b426003adf12c1eb4c34e72bedb4c2bf1ba8d3`
- **Licence:** BSD-2-Clause. libarchive's `COPYING`: "The libarchive distribution as a whole is
  Copyright by Tim Kientzle", and redistribution in source and binary forms is permitted with the
  copyright notice, the conditions and the disclaimer kept. Its full text is beside them in
  `COPYING.libarchive`, unchanged.

libarchive keeps its test archives uuencoded; each was fetched once at that commit and decoded with
a plain POSIX uudecode into the binary here, unchanged. The tests never touch the network.

| File | What it is |
| --- | --- |
| `test_read_format_rar.rar` | RAR 4: `test.txt`, a symlink, `testdir/test.txt` and an empty folder |
| `test_read_format_rar5_compressed.rar` | RAR 5, compressed: `test.bin` (1,200 bytes) |
| `test_rar_multivolume_single_file.part1.rar` … `part3.rar` | One file across three RAR volumes: `LibarchiveAddingTest.html` (20,111 bytes) |
| `test_read_format_rar_encryption_data.rar` | RAR 4 with encrypted data |
| `test_read_format_rar5_encrypted.rar` | RAR 5, encrypted |
| `test_read_format_7zip_copy.7z` | 7z, stored: `file1` (60 bytes) |
| `test_read_format_7zip_encryption.7z` | 7z, encrypted |
| `test_read_format_zip.zip` | zip: `dir/`, `file1`, `file2`, with `file2`'s CRC wrong on purpose (libarchive tests its error path with it; `unzip -t` reports it), so it's the damaged-archive case. The good zip is written by the test itself |

Contents were confirmed by listing each with `bsdtar -tvf` (libarchive), which reads all of them
except the encrypted ones' data.
