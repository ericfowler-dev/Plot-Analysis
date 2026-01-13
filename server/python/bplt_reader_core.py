"""
BPLT Reader Core - Decodes ECI Binary Plot Data Files
Based on BPLTExporter by Tyler Onkst (tonkst@psiengines.com)
"""
import os
import struct
from typing import Dict, List, TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd
    import numpy as np
    from scipy.interpolate import interp1d


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


def read_channel_name(file_handle) -> str:
    """Read a channel name from the file, handling double NULL termination."""
    # Skip first NULL
    while True:
        byte = file_handle.read(1)
        if byte == b'\x00' or not byte:  # Found first NULL or EOF
            break

    # Read until second NULL for channel name
    name = read_until_null(file_handle)

    # Return empty string if name is "NULL" or empty
    return "" if not name or name.upper() == "NULL" else name


def read_plot_property(file_handle) -> dict:
    """Read a single plot property entry."""
    # Read two NULL-terminated strings
    string1 = read_until_null(file_handle)
    string2 = read_until_null(file_handle)

    # Read 5 32-bit integers
    integers = struct.unpack('<IIIII', file_handle.read(20))  # 5 * 4 bytes

    # Read 2 64-bit doubles
    doubles = struct.unpack('<dd', file_handle.read(16))  # 2 * 8 bytes

    return {
        'string1': string1,
        'string2': string2,
        'integers': integers,
        'doubles': doubles
    }


def read_marker(file_handle) -> dict:
    """Read a single marker entry."""
    # Read 64-bit double
    double_value = struct.unpack('<d', file_handle.read(8))[0]

    # Read three NULL-terminated strings
    string1 = read_until_null(file_handle)
    string2 = read_until_null(file_handle)
    string3 = read_until_null(file_handle)

    return {
        'double_value': double_value,
        'string1': string1,
        'string2': string2,
        'string3': string3
    }


def read_header(file_path: str) -> dict:
    """Read the BPLT file header information."""
    try:
        with open(file_path, 'rb') as f:
            # Read until first NULL to get file identifier
            file_identifier = read_until_null(f)
            if not file_identifier.startswith("ECI Binary Plot Data File"):
                raise ValueError(f"Invalid file identifier: {file_identifier}")

            # Read until second NULL to get version
            version_string = read_until_null(f)
            if not version_string.startswith("ECI Binary Plot File Version"):
                raise ValueError(f"Invalid version string: {version_string}")

            # Read comments until next NULL
            comments = read_until_null(f)

            # Read two 32-bit unsigned integers (little endian)
            counts = f.read(8)
            if len(counts) < 8:
                raise ValueError(f"Incomplete counts data: got {len(counts)} bytes, expected 8")
            num_columns, num_rows = struct.unpack('<II', counts)

            # Read 64-bit double precision time delta
            time_delta_bytes = f.read(8)
            if len(time_delta_bytes) < 8:
                raise ValueError(f"Incomplete time delta data")
            time_delta = struct.unpack('<d', time_delta_bytes)[0]

            # Read channel names (each name is after 2 NULLs)
            channel_names = []
            for i in range(num_columns):
                channel_name = read_channel_name(f)
                if channel_name:
                    channel_names.append(channel_name)

            # Read additional header values
            plot_properties_count = struct.unpack('<I', f.read(4))[0]
            double_1 = struct.unpack('<d', f.read(8))[0]
            integer_1 = struct.unpack('<B', f.read(1))[0]
            double_2 = struct.unpack('<d', f.read(8))[0]
            integer_2 = struct.unpack('<I', f.read(4))[0]

            # Read plot properties
            plot_properties = []
            for i in range(plot_properties_count):
                prop = read_plot_property(f)
                plot_properties.append(prop)

            # Read number of markers
            num_markers = struct.unpack('<L', f.read(4))[0]

            # Read markers
            markers = []
            for i in range(num_markers):
                marker = read_marker(f)
                markers.append(marker)

            # Read final two 32-bit unsigned long integers
            final_integers = struct.unpack('<LL', f.read(8))
            final_integer_1, final_integer_2 = final_integers

            header_info = {
                'file_identifier': file_identifier,
                'version': version_string,
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
                'header_position': f.tell()
            }

            return header_info

    except Exception as e:
        raise Exception(f"Error reading BPLT header: {str(e)}")


def read_data(file_handle, channel_names: list) -> dict:
    """Read the data section of the BPLT file using optimized numpy arrays."""
    import numpy as np
    import pandas as pd

    channel_dfs = {}

    for channel_idx, channel_name in enumerate(channel_names):
        try:
            count_bytes = file_handle.read(4)
            if len(count_bytes) < 4:
                continue

            num_elements = struct.unpack('<L', count_bytes)[0]
            if num_elements == 0:
                continue

            # Use numpy arrays directly
            time_values = np.empty(num_elements, dtype=np.float64)
            data_values = np.empty(num_elements, dtype=np.float32)

            # Read time values in one block
            time_bytes = file_handle.read(8 * num_elements)
            if len(time_bytes) < 8 * num_elements:
                continue
            time_values[:] = struct.unpack(f'<{num_elements}d', time_bytes)

            # Read data values in one block
            data_bytes = file_handle.read(4 * num_elements)
            if len(data_bytes) < 4 * num_elements:
                continue
            data_values[:] = struct.unpack(f'<{num_elements}f', data_bytes)

            # Create DataFrame directly from numpy arrays
            df = pd.DataFrame({
                'Time': time_values,
                channel_name: data_values
            })
            channel_dfs[channel_name] = df

        except Exception as e:
            continue

    if not channel_dfs:
        raise Exception("No valid channels could be read from the file")

    return channel_dfs


def read_bplt_file(file_path: str) -> dict:
    """Read and parse a BPLT file."""
    try:
        with open(file_path, 'rb') as f:
            header = read_header(file_path)
            f.seek(header['header_position'])
            data = read_data(f, header['channel_names'])
            return {
                'header': header,
                'data': data
            }
    except Exception as e:
        raise Exception(f"Error reading BPLT file: {str(e)}")


def upsample_and_combine_channels(channel_dfs: dict) -> 'pd.DataFrame':
    """Upsample and combine all channels into a single DataFrame."""
    import numpy as np
    import pandas as pd
    from scipy.interpolate import interp1d

    # Get the channel with the most samples as reference
    max_samples = max(df.shape[0] for df in channel_dfs.values())

    # Get the reference channel (one with most samples)
    ref_channel_name, ref_channel = max(channel_dfs.items(), key=lambda x: x[1].shape[0])
    time_col = ref_channel['Time']

    # Prepare all channel data
    channel_data = {}

    for name, df in channel_dfs.items():
        if df.shape[0] < max_samples:
            # Create interpolation function using actual time values
            f = interp1d(df['Time'], df[name],
                        kind='linear',
                        bounds_error=False,
                        fill_value='extrapolate')

            # Interpolate to reference time points
            channel_data[name] = f(time_col)
        else:
            channel_data[name] = df[name].values

    # Create all DataFrames at once
    dfs_to_concat = [pd.DataFrame({'Time': time_col})]
    dfs_to_concat.extend(
        pd.DataFrame({name: data}) for name, data in channel_data.items()
    )

    # Combine all columns efficiently
    return pd.concat(dfs_to_concat, axis=1)


def convert_bplt_to_csv(input_path: str, output_path: str) -> None:
    """Convert a BPLT file to CSV format."""
    bplt_data = read_bplt_file(input_path)
    combined_df = upsample_and_combine_channels(bplt_data['data'])
    combined_df.to_csv(output_path, index=False)
