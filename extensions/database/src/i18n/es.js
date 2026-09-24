/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export default {
  view: { connections: 'Bases de datos' },
  toolbar: { add: 'Añadir conexión', openFile: 'Abrir archivo de base de datos', refresh: 'Actualizar' },
  type: {
    sqlite: 'SQLite', h2: 'H2', postgres: 'PostgreSQL', mysql: 'MariaDB / MySQL', mssql: 'SQL Server', redis: 'Redis', mongo: 'MongoDB',
  },
  typeDetail: {
    sqlite: 'Un archivo de base de datos (.db, .sqlite)', h2: 'Un archivo de base de datos H2 (.mv.db) — requiere Java',
    postgres: 'Conexión a servidor', mysql: 'Conexión a servidor', mssql: 'Microsoft SQL Server o Azure SQL',
    redis: 'Claves y valores', mongo: 'Documentos y colecciones',
  },
  status: { idle: 'Sin conectar', connecting: 'Conectando …', connected: 'Conectado', error: 'Error de conexión' },
  field: {
    name: 'Nombre', file: 'Archivo', fileHint: 'Ruta absoluta o relativa a la carpeta abierta.', host: 'Host', port: 'Puerto',
    user: 'Usuario', password: 'Contraseña', passwordKeep: 'sin cambios', database: 'Base de datos',
    databasePlaceholder: {
      postgres: 'postgres', mysql: 'todas las bases de datos', mssql: 'base de datos predeterminada', redis: '0', mongo: 'todas las bases de datos',
    },
    url: 'Cadena de conexión',
    urlPlaceholder: {
      postgres: 'postgres://user@host:5432/db', mysql: 'mysql://user@host:3306/db', mssql: 'Server=host,1433;Database=db;User Id=sa',
      redis: 'redis://user@host:6379/0', mongo: 'mongodb+srv://user@cluster.example.net/db',
    },
    urlHint: 'Opcional — sustituye los campos de arriba que incluya. La contraseña sigue en el campo de contraseña.',
    ssl: 'TLS', sslMode: { off: 'Desactivado', require: 'Cifrado, sin comprobar el certificado', verify: 'Cifrado y verificado' },
    sslCa: 'Certificado CA (archivo)', readOnly: 'Solo lectura', savePassword: 'Guardar la contraseña en el llavero del sistema',
  },
  connection: {
    pickType: 'Tipo de base de datos', addTitle: 'Nueva conexión {type}', editTitle: 'Editar «{name}»', save: 'Guardar',
    testFailedTitle: 'Error de conexión', testFailed: 'No se pudo establecer la conexión:\n\n{error}\n\n¿Guardarla de todos modos?',
    saveAnyway: 'Guardar de todos modos', copyName: '{name} (copia)',
    removeTitle: '¿Eliminar la conexión?', removeBody: 'Se eliminan «{name}» y su contraseña guardada. La base de datos no se toca.',
    remove: 'Eliminar',
  },
  connect: { passwordTitle: 'Contraseña de «{name}»', submit: 'Conectar' },
  file: {
    openTitle: 'Abrir un archivo de base de datos', open: 'Abrir',
    unknownType: '{name} no parece un archivo de base de datos — se intenta con SQLite.',
  },
  tree: {
    emptyTitle: 'Aún no hay conexiones', emptyHint: 'Añade un servidor o abre un archivo .db / .sqlite / .mv.db desde el explorador.',
    connect: 'Conectar', connecting: 'Conectando …', disconnect: 'Desconectar', refresh: 'Actualizar', edit: 'Editar …',
    duplicate: 'Duplicar', remove: 'Eliminar …', newQuery: 'Nueva consola SQL', openData: 'Abrir datos', structure: 'Estructura',
    selectQuery: 'Consultar en la consola', noTables: 'Sin tablas', keys: '{count} claves', openKeys: 'Explorar claves',
    newCollection: 'Nueva colección …', noCollections: 'Sin colecciones', openCollection: 'Abrir colección',
    dropCollection: 'Eliminar colección', dropCollectionConfirm: '¿Eliminar la colección «{name}» con todos sus documentos? No se puede deshacer.',
  },
  tab: { gone: 'Esta pestaña pertenece a una sesión anterior', goneHint: 'Vuelve a abrir la tabla desde la vista Bases de datos.' },
  table: {
    filterPlaceholder: 'WHERE … (una condición SQL, p. ej. age > 30)', applyFilter: 'Filtrar', clearFilter: 'Quitar filtro',
    loading: 'Cargando …', empty: 'Sin filas', sort: 'Ordenar', edit: 'Editar', page: 'Página', refresh: 'Actualizar',
    addRow: 'Añadir fila', deleteRows: 'Eliminar filas', export: 'Exportar …', default: 'DEFAULT',
    readOnlyNoKey: 'Solo lectura: la tabla no tiene una clave primaria con la que identificar sus filas.',
    pending: '{count} cambio(s) pendiente(s)', commit: 'Confirmar', rollback: 'Descartar', showSql: 'Mostrar SQL',
    commitTitle: '¿Ejecutar {count} sentencia(s)?', moreStatements: '{count} más',
    committed: 'Confirmado: {count} sentencia(s), {affected} fila(s) afectada(s).', commitFailed: 'No se escribió nada — {error}',
    selectRows: 'Selecciona primero las filas que quieres eliminar.',
  },
  structure: {
    tabTitle: '{table} (estructura)', columns: 'Columnas', indexes: 'Índices', name: 'Nombre', type: 'Tipo', nullable: 'Admite NULL',
    default: 'Valor predeterminado', primaryKey: 'Clave primaria', generated: 'Generada', unique: 'Única', yes: 'sí', noIndexes: 'Sin índices',
  },
  query: {
    tabTitle: 'SQL {number} · {name}', title: 'SQL · {name}', placeholder: 'SELECT … — Ctrl+Enter ejecuta el script o la selección',
    run: 'Ejecutar', stopWaiting: 'Dejar de esperar', clear: 'Borrar resultados', hint: 'Ctrl+Enter ejecuta el script, o solo el texto seleccionado.',
    running: 'Ejecutando …', result: 'Resultado',
    rows: '{count} fila(s) · {time}', rowsTruncated: 'Primeras {count} filas · {time} — hay más (ver el ajuste «máximo de filas»)',
    affected: '{count} fila(s) afectada(s) · {time}', done: 'Listo · {time}', failed: 'Error: {error}', noRows: 'Sin filas',
  },
  export: {
    title: 'Exportar', format: 'Formato', file: 'Archivo', fileHint: 'Ruta absoluta o relativa a la carpeta abierta.',
    submit: 'Exportar', rows: '{count} fila(s)', done: '{count} fila(s) escrita(s) en {file}.',
  },
  redis: {
    patternPlaceholder: 'Patrón, p. ej. user:*', search: 'Buscar', newKey: 'Nueva clave …', key: 'Clave', type: 'Tipo', ttl: 'TTL',
    found: '{count} clave(s)', foundMore: 'Primeras {count} claves — acota el patrón para ver otras',
    noKeys: 'Ninguna clave coincide', open: 'Abrir', setTtl: 'Establecer caducidad …', ttlSeconds: 'Segundos', ttlHint: '0 o vacío: nunca caduca.',
    delete: 'Eliminar', deleteTitle: '¿Eliminar claves?', deleteBody: 'Se eliminan definitivamente {count} clave(s), empezando por «{first}».',
    commandPlaceholder: 'Un comando de Redis, p. ej. INFO memory', run: 'Ejecutar',
    firstValue: 'Primer valor', firstValueHint: 'Para un hash, el nombre del primer campo; para un stream, el valor de su campo «field».',
    create: 'Crear', exists: 'La clave «{key}» ya existe.',
  },
  redisKey: {
    save: 'Guardar', saved: 'Guardado.', field: 'Campo', value: 'Valor', member: 'Miembro', score: 'Puntuación', fields: 'Campos',
    add: 'Añadir', edit: 'Editar', remove: 'Quitar', pushLeft: 'Añadir al principio', pushRight: 'Añadir al final',
    streamPlaceholder: 'campo valor campo valor …', noExpiry: 'nunca caduca', size: 'Tamaño',
    truncated: 'Se muestran {shown} de {total}.', gone: 'La clave no existe (ya)', goneHint: 'Puede haber caducado o haberse eliminado.',
    unsupported: 'Los valores de tipo {type} no se pueden mostrar.', rename: 'Renombrar …', deleteKey: 'Eliminar clave',
    badScore: 'La puntuación debe ser un número.', badStream: 'Indica pares de campo y valor: campo valor campo valor …',
  },
  mongo: {
    filterPlaceholder: 'Filtro, p. ej. { "age": { "$gt": 30 } }', sortPlaceholder: 'Orden, p. ej. { "_id": -1 }', find: 'Buscar',
    newDocument: 'Nuevo documento', edit: 'Editar', duplicate: 'Duplicar', delete: 'Eliminar', noDocuments: 'Sin documentos',
    editingNew: 'Nuevo documento — Ctrl+Enter lo inserta', editingDocument: 'Documento (Extended JSON) — Ctrl+Enter lo guarda',
    save: 'Guardar', insert: 'Insertar', close: 'Cerrar', saved: 'Documento guardado.', inserted: 'Documento insertado.',
    notFound: 'El documento ya no se encontró — no se guardó nada.', invalidJson: 'JSON no válido: {error}',
    deleteTitle: '¿Eliminar documentos?', deleteBody: 'Se eliminan definitivamente {count} documento(s).', deleted: '{count} documento(s) eliminado(s).',
  },
  command: { noSqlConnection: 'Aún no hay ninguna conexión SQL.', pickConnection: 'Conexión para la consola' },
  error: {
    unknown: 'Error desconocido', cancelled: 'Cancelado.', noConnection: 'La conexión ya no existe.',
    noFile: 'No se indicó ningún archivo de base de datos.', fileMissing: 'El archivo {file} no existe.',
    noSqlite: 'Este Lumen no incluye SQLite (Node {version}); SQLite requiere Node 22.5 o posterior.',
    workerGone: 'El worker de SQLite se detuvo. La próxima consulta lo vuelve a iniciar.',
    timeout: 'La consulta tardó más de {seconds} s y se detuvo (ajuste «tiempo límite de consulta»).',
    noJava: 'H2 requiere Java 11 o posterior. Instala un JDK/JRE, define JAVA_HOME o indica java en los ajustes de la extensión.',
    h2Download: 'No se pudo descargar el controlador de H2: {error}',
    redisSelect: 'SELECT no está disponible aquí — abre la otra base de datos desde el árbol.',
    keyExists: 'La clave «{key}» ya existe.',
  },
};
