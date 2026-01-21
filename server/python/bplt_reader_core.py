"""
BPLT Reader Core - Decodes ECI Binary Plot Data Files
Based on BPLTExporter by Tyler Onkst (tonkst@psiengines.com)

Version-aware parser with support for legacy BPLT v1.1.0 headers and
optional debug logging for troubleshooting conversions.
"""
import os
import struct
from typing import TYPE_CHECKING, Tuple

if TYPE_CHECKING:
    import pandas as pd
    import numpy as np
    from scipy.interpolate import interp1d


def _log(debug: bool, message: str) -> None:
    """Lightweight debug logger."""
    if debug:
        print(message)


def parse_version(version_string: str) -> Tuple[int, int, int]:
    """Parse version string like 'ECI Binary Plot File Version 4.2.0'."""
    try:
        version_part = version_string.replace("ECI Binary Plot File Version ", "")
        major, minor, patch = map(int, version_part.split('.'))
        return major, minor, patch
    except Exception:
        # Default to legacy format if parsing fails
        return 1, 0, 0


def is_valid_channel_name(name: str) -> bool:
    """Check if a string looks like a valid channel name."""
    if not name or len(name) < 2:
        return False

    invalid_markers = ['@', '#', '*EVENT*', '/', '>', 'Q#A']
    return (name[0].isalnum() and
            not any(marker in name for marker in invalid_markers) and
            name.isprintable() and
            not name.startswith('?'))


def read_until_null(file_handle) -> str:
    """Read bytes from a file until a NULL character is encountered."""
    result = bytearray()
    while True:
        byte = file_handle.read(1)
        if byte == b'\x00' or not byte:  # NULL or EOF
            break
        result.extend(byte)
    return result.decode('ascii', errors='ignore').strip()


def read_channel_name(file_handle, version: Tuple[int, int, int] | None = None) -> str:
    """
    Read a channel name from the file.

    v1.1.0 uses single NULL termination; newer versions use double NULL.
    """
    is_version_1_1 = version and version[0] == 1 and version[1] == 1

    if not is_version_1_1:
        # Skip until the first NULL for double-terminated names
        while True:
            byte = file_handle.read(1)
            if byte == b'\x00' or not byte:
                break

    name = read_until_null(file_handle)
    return "" if not name or name.upper() == "NULL" else name


def read_plot_property_safe(file_handle, version: Tuple[int, int, int] | None = None) -> dict:
    """
    Read a single plot property entry with version-aware parsing.

    v1.1.0: one string + 5 ints + 2 doubles
    v4.1.0: two strings + 5 ints (no doubles)
    other versions: two strings + 5 ints + 2 doubles
    """
    skip_doubles = False
    single_string = False

    if version:
        major, minor, _ = version
        if major == 4 and minor == 1:
            skip_doubles = True
        if major == 1 and minor == 1:
            single_string = True

    string1 = read_until_null(file_handle)
    string2 = "" if single_string else read_until_null(file_handle)

    int_bytes = file_handle.read(20)  # 5 * 4 bytes
    if len(int_bytes) < 20:
        raise ValueError(f"Incomplete plot property integers: got {len(int_bytes)} bytes")
    integers = struct.unpack('<IIIII', int_bytes)

    if skip_doubles:
        doubles = (0.0, 0.0)
    else:
        double_bytes = file_handle.read(16)  # 2 * 8 bytes
        doubles = struct.unpack('<dd', double_bytes) if len(double_bytes) >= 16 else (0.0, 0.0)

    return {
        'string1': string1,
        'string2': string2,
        'integers': integers,
        'doubles': doubles
    }


def read_marker(file_handle) -> dict:
    """Read a single marker entry."""
    double_value = struct.unpack('<d', file_handle.read(8))[0]
    string1 = read_until_null(file_handle)
    string2 = read_until_null(file_handle)
    string3 = read_until_null(file_handle)

    return {
        'double_value': double_value,
        'string1': string1,
        'string2': string2,
        'string3': string3
    }


def read_header_from_handle(file_handle, debug: bool = False) -> dict:
    """Read the BPLT file header information from an open file handle."""
    file_identifier = read_until_null(file_handle)
    _log(debug, f"File identifier: {file_identifier}")
    if not file_identifier.startswith("ECI Binary Plot Data File"):
        raise ValueError(f"Invalid file identifier: {file_identifier}")

    version_string = read_until_null(file_handle)
    _log(debug, f"Version string: {version_string}")
    if not version_string.startswith("ECI Binary Plot File Version"):
        raise ValueError(f"Invalid version string: {version_string}")

    version_tuple = parse_version(version_string)
    _log(debug, f"Parsed version: {version_tuple[0]}.{version_tuple[1]}.{version_tuple[2]}")

    comments = read_until_null(file_handle)
    _log(debug, f"Comments: {comments}")

    counts = file_handle.read(8)  # 4 bytes each for two integers
    if len(counts) < 8:
        raise ValueError(f"Incomplete counts data: got {len(counts)} bytes, expected 8")
    num_columns, num_rows = struct.unpack('<II', counts)
    _log(debug, f"Columns: {num_columns}, Rows: {num_rows}")

    time_delta_bytes = file_handle.read(8)
    if len(time_delta_bytes) < 8:
        raise ValueError(f"Incomplete time delta data: got {len(time_delta_bytes)} bytes")
    time_delta = struct.unpack('<d', time_delta_bytes)[0]
    _log(debug, f"Time delta: {time_delta}")

    channel_names = []
    for _ in range(num_columns):
        channel_name = read_channel_name(file_handle, version=version_tuple)
        if channel_name:
            channel_names.append(channel_name)

    # Optional header fields (present in legacy files as well)
    plot_properties_count = 0
    double_1 = 0.0
    integer_1 = 0
    double_2 = 0.0
    integer_2 = 0
    plot_properties = []
    num_markers = 0
    markers = []
    final_integer_1 = 0
    final_integer_2 = 0

    try:
        plot_props_count_bytes = file_handle.read(4)
        if len(plot_props_count_bytes) >= 4:
            plot_properties_count = struct.unpack('<I', plot_props_count_bytes)[0]

            double1_bytes = file_handle.read(8)
            if len(double1_bytes) >= 8:
                double_1 = struct.unpack('<d', double1_bytes)[0]

            int1_bytes = file_handle.read(1)
            if len(int1_bytes) >= 1:
                integer_1 = struct.unpack('<B', int1_bytes)[0]

            double2_bytes = file_handle.read(8)
            if len(double2_bytes) >= 8:
                double_2 = struct.unpack('<d', double2_bytes)[0]

            int2_bytes = file_handle.read(4)
            if len(int2_bytes) >= 4:
                integer_2 = struct.unpack('<I', int2_bytes)[0]

            for idx in range(plot_properties_count):
                try:
                    prop = read_plot_property_safe(file_handle, version=version_tuple)
                    plot_properties.append(prop)
                except Exception as exc:
                    _log(debug, f"Warning: Failed to read plot property {idx}: {exc}")
                    break

            markers_count_bytes = file_handle.read(4)
            if len(markers_count_bytes) >= 4:
                num_markers = struct.unpack('<L', markers_count_bytes)[0]

                for idx in range(num_markers):
                    try:
                        marker = read_marker(file_handle)
                        markers.append(marker)
                    except Exception as exc:
                        _log(debug, f"Warning: Failed to read marker {idx}: {exc}")
                        break

                final_bytes = file_handle.read(8)
                if len(final_bytes) >= 8:
                    final_integer_1, final_integer_2 = struct.unpack('<LL', final_bytes)
    except Exception as exc:
        _log(debug, f"Warning: Some header fields could not be read: {exc}")

    return {
        'file_identifier': file_identifier,
        'version': version_string,
        'parsed_version': version_tuple,
        'comments': comments,
        'num_columns': num_columns,
        'num_rows': num_rows,
        'time_delta': time_delta,
        'channel_names': channel_names,
        'plot_properties_count': plot_properties_count,
        'double_1': double_1,
        'integer_1': integer_1,
        'double_2': double_2,
        'integer_2': integer_2,
        'plot_properties': plot_properties,
        'num_markers': num_markers,
        'markers': markers,
        'final_integer_1': final_integer_1,
        'final_integer_2': final_integer_2,
        'header_position': file_handle.tell(),
    }


def read_header(file_path: str, debug: bool = False) -> dict:
    """Read the BPLT file header information."""
    with open(file_path, 'rb') as f:
        return read_header_from_handle(f, debug=debug)


def read_data(file_handle, channel_names: list, header_info: dict | None = None, debug: bool = False) -> dict:
    """Read the data section of the BPLT file using numpy for efficiency."""
    import numpy as np
    import pandas as pd

    channel_dfs = {}
    for channel_idx, channel_name in enumerate(channel_names):
        try:
            count_bytes = file_handle.read(4)
            if len(count_bytes) < 4:
                _log(debug, f"Skipping channel {channel_name}: missing count bytes")
                continue

            num_elements = struct.unpack('<L', count_bytes)[0]
            if num_elements == 0:
                _log(debug, f"Skipping channel {channel_name}: zero elements")
                continue

            time_bytes = file_handle.read(8 * num_elements)
            if len(time_bytes) < 8 * num_elements:
                _log(debug, f"Skipping channel {channel_name}: incomplete time data")
                continue
            time_values = np.frombuffer(time_bytes, dtype='<f8', count=num_elements)

            data_bytes = file_handle.read(4 * num_elements)
            if len(data_bytes) < 4 * num_elements:
                _log(debug, f"Skipping channel {channel_name}: incomplete value data")
                continue
            data_values = np.frombuffer(data_bytes, dtype='<f4', count=num_elements)

            df = pd.DataFrame({
                'Time': time_values,
                channel_name: data_values
            })
            channel_dfs[channel_name] = df
        except Exception as exc:
            _log(debug, f"Warning: Error reading channel {channel_name}: {exc}")
            continue

    if not channel_dfs:
        raise Exception("No valid channels could be read from the file")

    return channel_dfs


def read_bplt_file(file_path: str, debug: bool = False, header: dict | None = None) -> dict:
    """Read and parse a BPLT file."""
    with open(file_path, 'rb') as f:
        if header is None:
            header = read_header_from_handle(f, debug=debug)
        else:
            # Seek to data section when header was pre-read
            f.seek(header['header_position'])
        data = read_data(f, header['channel_names'], header, debug=debug)
        return {
            'header': header,
            'data': data
        }


def upsample_and_combine_channels(channel_dfs: dict, debug: bool = False) -> 'pd.DataFrame':
    """Upsample and combine all channels into a single DataFrame."""
    import numpy as np
    import pandas as pd
    from scipy.interpolate import interp1d

    max_samples = max(df.shape[0] for df in channel_dfs.values())
    ref_channel_name, ref_channel = max(channel_dfs.items(), key=lambda x: x[1].shape[0])
    time_col = ref_channel['Time']

    channel_data = {}
    for name, df in channel_dfs.items():
        if df.shape[0] < max_samples:
            interpolator = interp1d(
                df['Time'],
                df[name],
                kind='linear',
                bounds_error=False,
                fill_value='extrapolate'
            )
            channel_data[name] = interpolator(time_col)
        else:
            channel_data[name] = df[name].values

    _log(debug, f"Reference channel: {ref_channel_name} ({max_samples} samples)")
    dfs_to_concat = [pd.DataFrame({'Time': time_col})]
    dfs_to_concat.extend(pd.DataFrame({name: data}) for name, data in channel_data.items())
    return pd.concat(dfs_to_concat, axis=1)


def convert_bplt_to_csv(input_path: str, output_path: str, debug: bool = False) -> None:
    """Convert a BPLT file to CSV format."""
    header = read_header(input_path, debug=debug)

    max_cells = int(os.getenv("BPLT_MAX_CELLS", "5000000"))
    num_columns = int(header.get("num_columns") or 0)
    num_rows = int(header.get("num_rows") or 0)
    estimated_cells = num_columns * num_rows if num_columns and num_rows else 0

    if max_cells > 0 and estimated_cells > max_cells:
        raise ValueError(
            "BPLT file too large for server conversion. "
            f"Estimated {num_rows} rows x {num_columns} columns ({estimated_cells:,} cells). "
            "Convert locally or increase BPLT_MAX_CELLS."
        )

    bplt_data = read_bplt_file(input_path, debug=debug, header=header)
    combined_df = upsample_and_combine_channels(bplt_data['data'], debug=debug)
    combined_df.to_csv(output_path, index=False)
