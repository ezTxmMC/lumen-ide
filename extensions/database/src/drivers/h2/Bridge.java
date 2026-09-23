/*
 * A tiny JDBC bridge for the Database extension: H2 has no JavaScript driver,
 * so the extension runs this with the H2 jar on the classpath and talks to it
 * over stdin/stdout.
 *
 * Requests, one per line, tab-separated: `<id> <command> <field>...` — every
 * field after the command is base64 of UTF-8 text.
 *
 *   open  <url> <user> <password>
 *   query <sql> <maxRows> <timeoutSeconds> <param>...   (param: n | s:<text> | d:<number> | b:<bool> | x:<hex>)
 *   begin | commit | rollback | close
 *
 * Responses, one JSON object per line:
 *   {"id":"1","ok":true,"columns":[{"name":..,"type":..}],"rows":[[..]],"affected":n,"truncated":false}
 *   {"id":"1","ok":false,"error":".."}
 *
 * Deliberately without inner or anonymous classes: the extension ships this as
 * one compiled class file.
 */

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.Base64;

public class Bridge {
    private static final long MAX_EXACT = 1L << 53;
    private static Connection connection;
    private static PrintStream out;

    public static void main(String[] args) throws Exception {
        out = new PrintStream(System.out, true, "UTF-8");
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while ((line = in.readLine()) != null) {
            if (line.isEmpty()) continue;
            String[] parts = line.split("\t", -1);
            String id = parts[0];
            String command = parts.length > 1 ? parts[1] : "";
            try {
                String result = handle(command, parts);
                out.println("{\"id\":" + quote(id) + ",\"ok\":true" + result + "}");
                if (command.equals("close")) return;
            } catch (Throwable err) {
                String message = err.getMessage() == null ? err.toString() : err.getMessage();
                out.println("{\"id\":" + quote(id) + ",\"ok\":false,\"error\":" + quote(message) + "}");
            }
        }
        if (connection != null) connection.close();
    }

    private static String field(String[] parts, int index) {
        if (index >= parts.length) return "";
        return new String(Base64.getDecoder().decode(parts[index]), StandardCharsets.UTF_8);
    }

    private static Connection open() throws SQLException {
        if (connection == null) throw new SQLException("Not connected");
        return connection;
    }

    private static String handle(String command, String[] parts) throws Exception {
        if (command.equals("open")) {
            connection = DriverManager.getConnection(field(parts, 2), field(parts, 3), field(parts, 4));
            return "";
        }
        if (command.equals("query")) return query(parts);
        if (command.equals("begin")) {
            open().setAutoCommit(false);
            return "";
        }
        if (command.equals("commit")) {
            open().commit();
            open().setAutoCommit(true);
            return "";
        }
        if (command.equals("rollback")) {
            open().rollback();
            open().setAutoCommit(true);
            return "";
        }
        if (command.equals("close")) {
            if (connection != null) connection.close();
            connection = null;
            return "";
        }
        throw new IllegalArgumentException("Unknown command: " + command);
    }

    private static String query(String[] parts) throws Exception {
        String sql = field(parts, 2);
        int maxRows = Integer.parseInt(field(parts, 3));
        int timeout = Integer.parseInt(field(parts, 4));
        PreparedStatement statement = open().prepareStatement(sql);
        try {
            for (int i = 5; i < parts.length; i++) bind(statement, i - 4, field(parts, i));
            if (timeout > 0) statement.setQueryTimeout(timeout);
            // One row more than wanted tells whether there were more.
            if (maxRows > 0 && maxRows < Integer.MAX_VALUE) statement.setMaxRows(maxRows + 1);
            boolean hasRows = statement.execute();
            if (!hasRows) return ",\"columns\":[],\"rows\":[],\"affected\":" + statement.getUpdateCount() + ",\"truncated\":false";
            return rows(statement.getResultSet(), maxRows);
        } finally {
            statement.close();
        }
    }

    private static void bind(PreparedStatement statement, int index, String param) throws SQLException {
        if (param.equals("n")) {
            statement.setNull(index, Types.NULL);
            return;
        }
        String value = param.length() > 2 ? param.substring(2) : "";
        if (param.startsWith("d:")) {
            statement.setBigDecimal(index, new BigDecimal(value));
            return;
        }
        if (param.startsWith("b:")) {
            statement.setBoolean(index, value.equals("true"));
            return;
        }
        if (param.startsWith("x:")) {
            statement.setBytes(index, fromHex(value));
            return;
        }
        statement.setString(index, value);
    }

    private static String rows(ResultSet result, int maxRows) throws SQLException {
        ResultSetMetaData meta = result.getMetaData();
        int count = meta.getColumnCount();
        StringBuilder json = new StringBuilder(",\"columns\":[");
        for (int i = 1; i <= count; i++) {
            if (i > 1) json.append(',');
            json.append("{\"name\":").append(quote(meta.getColumnLabel(i)))
                .append(",\"type\":").append(quote(meta.getColumnTypeName(i))).append('}');
        }
        json.append("],\"rows\":[");
        int read = 0;
        boolean truncated = false;
        while (result.next()) {
            if (read >= maxRows) {
                truncated = true;
                break;
            }
            if (read > 0) json.append(',');
            json.append('[');
            for (int i = 1; i <= count; i++) {
                if (i > 1) json.append(',');
                json.append(value(result.getObject(i)));
            }
            json.append(']');
            read++;
        }
        result.close();
        return json.append("],\"truncated\":").append(truncated).toString();
    }

    /** A value as JSON: exact numbers as numbers, everything that would lose precision as text. */
    private static String value(Object value) {
        if (value == null) return "null";
        if (value instanceof String) return quote((String) value);
        if (value instanceof Boolean) return value.toString();
        if (value instanceof Integer || value instanceof Short || value instanceof Byte) return value.toString();
        if (value instanceof Long) {
            long number = (Long) value;
            if (number <= MAX_EXACT && number >= -MAX_EXACT) return value.toString();
            return quote(value.toString());
        }
        if (value instanceof Double || value instanceof Float) {
            double number = ((Number) value).doubleValue();
            if (Double.isNaN(number) || Double.isInfinite(number)) return quote(value.toString());
            return value.toString();
        }
        if (value instanceof BigDecimal) return quote(((BigDecimal) value).toPlainString());
        if (value instanceof BigInteger) return quote(value.toString());
        if (value instanceof byte[]) return quote("0x" + toHex((byte[]) value));
        if (value instanceof Timestamp) return quote(((Timestamp) value).toLocalDateTime().toString().replace('T', ' '));
        if (value instanceof java.sql.Blob) return blob((java.sql.Blob) value);
        if (value instanceof java.sql.Clob) return clob((java.sql.Clob) value);
        if (value instanceof Object[]) return array((Object[]) value);
        if (value instanceof java.sql.Array) {
            try {
                return array((Object[]) ((java.sql.Array) value).getArray());
            } catch (SQLException err) {
                return quote(value.toString());
            }
        }
        // java.time values print with a `T`; the other drivers show dates the way SQL writes them.
        if (value instanceof java.time.LocalDateTime || value instanceof java.time.OffsetDateTime) return quote(value.toString().replace('T', ' '));
        return quote(value.toString());
    }

    private static String array(Object[] values) {
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) {
            if (i > 0) json.append(',');
            json.append(value(values[i]));
        }
        return json.append(']').toString();
    }

    private static String blob(java.sql.Blob blob) {
        try {
            return quote("0x" + toHex(blob.getBytes(1, (int) Math.min(blob.length(), Integer.MAX_VALUE))));
        } catch (SQLException err) {
            return quote(err.getMessage());
        }
    }

    private static String clob(java.sql.Clob clob) {
        try {
            return quote(clob.getSubString(1, (int) Math.min(clob.length(), Integer.MAX_VALUE)));
        } catch (SQLException err) {
            return quote(err.getMessage());
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) hex.append(Character.forDigit((b >> 4) & 0xf, 16)).append(Character.forDigit(b & 0xf, 16));
        return hex.toString();
    }

    private static byte[] fromHex(String hex) {
        byte[] bytes = new byte[hex.length() / 2];
        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        return bytes;
    }

    private static String quote(String text) {
        StringBuilder json = new StringBuilder(text.length() + 2).append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"' || c == '\\') {
                json.append('\\').append(c);
                continue;
            }
            if (c == '\n') {
                json.append("\\n");
                continue;
            }
            if (c == '\r') {
                json.append("\\r");
                continue;
            }
            if (c == '\t') {
                json.append("\\t");
                continue;
            }
            // Control characters and the line separators JavaScript once choked on.
            if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                json.append(String.format("\\u%04x", (int) c));
                continue;
            }
            json.append(c);
        }
        return json.append('"').toString();
    }
}
