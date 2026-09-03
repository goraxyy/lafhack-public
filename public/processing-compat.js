/**
 * Runtime shims for sketches running under Processing.js 1.6.6.
 *
 * Processing.js covers the Processing core API, but not the pieces a desktop
 * sketch gets for free from Java and the contributed libraries:
 *
 *   - `PApplet.CENTER` and friends, used by sketches whose tabs were written as
 *     real .java classes taking a `PApplet` parameter.
 *   - `processing.sound.SoundFile`, backed here by an <audio> element.
 *   - `Table` / `loadTable()` / `saveTable()`, backed by CSV text fetched
 *     before the sketch starts (Processing's loadTable is synchronous, so the
 *     data has to already be in memory by the time setup() runs).
 *
 * Loaded before processing.min.js. Everything lives on `window` because
 * Processing.js compiles sketch code with the global scope in its scope chain,
 * which is how an unqualified `SoundFile` in a .pde resolves to this shim.
 */
(function (global) {
  'use strict';

  var dataBase = '';
  var tableCache = Object.create(null);

  // -------------------------------------------------------------------------
  // CSV / TSV
  // -------------------------------------------------------------------------

  function parseDelimited(text, delimiter) {
    var rows = [];
    var row = [];
    var field = '';
    var quoted = false;
    var index = 0;

    // Strip a UTF-8 BOM, which would otherwise become part of the first header.
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    while (index < text.length) {
      var character = text.charAt(index);

      if (quoted) {
        if (character === '"') {
          if (text.charAt(index + 1) === '"') {
            field += '"';
            index += 2;
            continue;
          }
          quoted = false;
          index += 1;
          continue;
        }
        field += character;
        index += 1;
        continue;
      }

      if (character === '"') {
        quoted = true;
        index += 1;
        continue;
      }

      if (character === delimiter) {
        row.push(field);
        field = '';
        index += 1;
        continue;
      }

      if (character === '\n' || character === '\r') {
        if (character === '\r' && text.charAt(index + 1) === '\n') index += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        index += 1;
        continue;
      }

      field += character;
      index += 1;
    }

    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    // Trailing newlines produce a single empty cell; that is not a data row.
    return rows.filter(function (candidate) {
      return candidate.length > 1 || (candidate.length === 1 && candidate[0] !== '');
    });
  }

  function formatDelimited(headers, rows, delimiter) {
    var lines = [];

    function escapeCell(value) {
      var cell = value === null || value === undefined ? '' : String(value);
      if (cell.indexOf(delimiter) >= 0 || cell.indexOf('"') >= 0 || /[\r\n]/.test(cell)) {
        return '"' + cell.replace(/"/g, '""') + '"';
      }
      return cell;
    }

    if (headers) lines.push(headers.map(escapeCell).join(delimiter));
    for (var index = 0; index < rows.length; index += 1) {
      lines.push(rows[index].map(escapeCell).join(delimiter));
    }

    return lines.join('\n') + '\n';
  }

  // -------------------------------------------------------------------------
  // Table / TableRow
  // -------------------------------------------------------------------------

  function TableRow(table, cells) {
    this.$table = table;
    this.$cells = cells;
  }

  TableRow.prototype.$index = function (column) {
    if (typeof column === 'number') return column;
    var found = this.$table.$headers ? this.$table.$headers.indexOf(column) : -1;
    return found < 0 ? 0 : found;
  };

  TableRow.prototype.getString = function (column) {
    var value = this.$cells[this.$index(column)];
    return value === undefined || value === null ? '' : String(value);
  };

  TableRow.prototype.getInt = function (column) {
    var value = parseInt(this.getString(column), 10);
    return isNaN(value) ? 0 : value;
  };

  TableRow.prototype.getFloat = function (column) {
    var value = parseFloat(this.getString(column));
    return isNaN(value) ? 0 : value;
  };

  TableRow.prototype.getLong = TableRow.prototype.getInt;
  TableRow.prototype.getDouble = TableRow.prototype.getFloat;

  TableRow.prototype.setString = function (column, value) {
    this.$cells[this.$index(column)] = value === null || value === undefined ? '' : String(value);
  };

  TableRow.prototype.setInt = TableRow.prototype.setString;
  TableRow.prototype.setFloat = TableRow.prototype.setString;
  TableRow.prototype.setLong = TableRow.prototype.setString;
  TableRow.prototype.setDouble = TableRow.prototype.setString;

  TableRow.prototype.getColumnCount = function () {
    return this.$cells.length;
  };

  function Table(rows, headers) {
    this.$headers = headers || null;
    this.$rows = [];
    this.$types = [];

    for (var index = 0; index < (rows || []).length; index += 1) {
      this.$rows.push(new TableRow(this, rows[index]));
    }
  }

  Table.STRING = 0;
  Table.INT = 1;
  Table.LONG = 2;
  Table.FLOAT = 3;
  Table.DOUBLE = 4;
  Table.CATEGORY = 5;

  Table.prototype.getRowCount = function () {
    return this.$rows.length;
  };

  Table.prototype.getColumnCount = function () {
    if (this.$headers) return this.$headers.length;
    return this.$rows.length > 0 ? this.$rows[0].$cells.length : 0;
  };

  Table.prototype.getRow = function (index) {
    return this.$rows[index];
  };

  Table.prototype.rows = function () {
    return this.$rows;
  };

  Table.prototype.getRows = Table.prototype.rows;

  Table.prototype.addRow = function (source) {
    var cells = [];
    var width = this.getColumnCount();

    for (var index = 0; index < width; index += 1) {
      cells.push(source ? source.getString(index) : '');
    }

    var row = new TableRow(this, cells);
    this.$rows.push(row);
    return row;
  };

  Table.prototype.removeRow = function (index) {
    return this.$rows.splice(index, 1)[0];
  };

  Table.prototype.clearRows = function () {
    this.$rows = [];
  };

  Table.prototype.addColumn = function (title) {
    if (!this.$headers) this.$headers = [];
    this.$headers.push(title === undefined ? '' : String(title));

    for (var index = 0; index < this.$rows.length; index += 1) {
      this.$rows[index].$cells.push('');
    }
  };

  Table.prototype.getColumnTitle = function (index) {
    return this.$headers ? this.$headers[index] : null;
  };

  Table.prototype.setColumnType = function (column, type) {
    var index = typeof column === 'number' ? column : (this.$headers || []).indexOf(column);
    if (index >= 0) this.$types[index] = type;
  };

  Table.prototype.getString = function (rowIndex, column) {
    var row = this.$rows[rowIndex];
    return row ? row.getString(column) : '';
  };

  Table.prototype.getInt = function (rowIndex, column) {
    var row = this.$rows[rowIndex];
    return row ? row.getInt(column) : 0;
  };

  Table.prototype.getFloat = function (rowIndex, column) {
    var row = this.$rows[rowIndex];
    return row ? row.getFloat(column) : 0;
  };

  /** Ascending sort, numeric when the column was declared numeric. */
  Table.prototype.sort = function (column) {
    var index = typeof column === 'number' ? column : (this.$headers || []).indexOf(column);
    if (index < 0) return;

    var type = this.$types[index];
    var numeric =
      type === Table.INT || type === Table.LONG || type === Table.FLOAT || type === Table.DOUBLE;

    this.$rows.sort(function (left, right) {
      if (numeric) return left.getFloat(index) - right.getFloat(index);
      return left.getString(index).localeCompare(right.getString(index));
    });
  };

  Table.prototype.trim = function () {
    for (var index = 0; index < this.$rows.length; index += 1) {
      var cells = this.$rows[index].$cells;
      for (var cell = 0; cell < cells.length; cell += 1) {
        cells[cell] = String(cells[cell]).trim();
      }
    }
  };

  Table.prototype.$toText = function (delimiter) {
    var rows = this.$rows.map(function (row) {
      return row.$cells;
    });
    return formatDelimited(this.$headers, rows, delimiter);
  };

  // -------------------------------------------------------------------------
  // loadTable / saveTable
  // -------------------------------------------------------------------------

  function storageKey(name) {
    return 'processingplay:table:' + global.location.pathname + ':' + name;
  }

  function readOverride(name) {
    try {
      return global.localStorage.getItem(storageKey(name));
    } catch (error) {
      return null;
    }
  }

  function writeOverride(name, text) {
    try {
      global.localStorage.setItem(storageKey(name), text);
    } catch (error) {
      /* private browsing or storage disabled -- in-memory cache still applies */
    }
  }

  function normalizeName(name) {
    return String(name || '')
      .replace(/^\.?\/*/, '')
      .replace(/^data\//i, '');
  }

  function delimiterFor(name, options) {
    if (/tsv/i.test(options) || /\.tsv$/i.test(name)) return '\t';
    return ',';
  }

  global.loadTable = function (name, options) {
    var key = normalizeName(name);
    var settings = options === undefined || options === null ? '' : String(options);
    var delimiter = delimiterFor(key, settings);
    var text = tableCache[key];

    if (text === undefined) {
      console.warn(
        '[processing-compat] loadTable("' +
          name +
          '") had no preloaded data; returning an empty table.'
      );
      text = '';
    }

    var rows = parseDelimited(text, delimiter);
    var headers = null;

    if (/header/i.test(settings) && rows.length > 0) {
      headers = rows.shift();
    }

    return new Table(rows, headers);
  };

  global.saveTable = function (table, name, options) {
    if (!table || typeof table.$toText !== 'function') return;

    var key = normalizeName(name);
    var text = table.$toText(delimiterFor(key, options === undefined ? '' : String(options)));

    // The browser cannot write back into the project's storage bucket, so the
    // edit is kept for this viewer instead of being silently dropped.
    tableCache[key] = text;
    writeOverride(key, text);
  };

  global.Table = Table;
  global.TableRow = TableRow;

  // -------------------------------------------------------------------------
  // processing.sound
  // -------------------------------------------------------------------------

  var pendingPlayback = [];
  var gestureHookInstalled = false;

  function installGestureHook() {
    if (gestureHookInstalled) return;
    gestureHookInstalled = true;

    var resume = function () {
      var queued = pendingPlayback;
      pendingPlayback = [];
      for (var index = 0; index < queued.length; index += 1) {
        queued[index]();
      }
    };

    ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
      global.addEventListener(type, resume, { once: true });
    });
  }

  /**
   * Every SoundFile ever created, so the player's volume control can reach
   * sounds the sketch constructs later (most do it in setup(), but not all).
   * Sketches make a handful of these, so a plain array is fine.
   */
  var soundFiles = [];

  /**
   * Master volume, 0..1. A multiplier rather than a replacement: a sketch that
   * calls amp(0.3) on a quiet loop should stay quieter than the rest when the
   * viewer moves the slider.
   */
  var masterVolume = 1;

  function applyVolume(sound) {
    sound.$element.volume = Math.max(0, Math.min(1, sound.$amp * masterVolume));
  }

  /** Minimal stand-in for processing.sound.SoundFile. */
  function SoundFile(parent, path) {
    this.$element = new Audio(dataBase + normalizeName(path));
    this.$element.preload = 'auto';
    this.$element.crossOrigin = 'anonymous';
    this.$playing = false;
    /** What the sketch asked for through amp(), before the master multiplier. */
    this.$amp = 1;

    soundFiles.push(this);
    applyVolume(this);
  }

  /** Called by the player chrome outside the iframe. */
  function setMasterVolume(level) {
    masterVolume = Math.max(0, Math.min(1, Number(level) || 0));
    for (var i = 0; i < soundFiles.length; i += 1) applyVolume(soundFiles[i]);
  }

  SoundFile.prototype.$start = function (loop) {
    var self = this;
    this.$element.loop = !!loop;

    var attempt = function () {
      var promise = self.$element.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(function () {
          // Autoplay is blocked until the viewer interacts with the page.
          installGestureHook();
          pendingPlayback.push(attempt);
        });
      }
    };

    this.$playing = true;
    attempt();
  };

  SoundFile.prototype.play = function () {
    try {
      this.$element.currentTime = 0;
    } catch (error) {
      /* not seekable yet */
    }
    this.$start(false);
  };

  SoundFile.prototype.loop = function () {
    this.$start(true);
  };

  SoundFile.prototype.stop = function () {
    this.$playing = false;
    this.$element.pause();
    try {
      this.$element.currentTime = 0;
    } catch (error) {
      /* not seekable yet */
    }
  };

  SoundFile.prototype.pause = function () {
    this.$playing = false;
    this.$element.pause();
  };

  SoundFile.prototype.isPlaying = function () {
    return this.$playing && !this.$element.paused;
  };

  SoundFile.prototype.amp = function (level) {
    this.$amp = Math.max(0, Math.min(1, Number(level)));
    applyVolume(this);
  };

  SoundFile.prototype.rate = function (value) {
    this.$element.playbackRate = Number(value) || 1;
  };

  SoundFile.prototype.jump = function (seconds) {
    try {
      this.$element.currentTime = Number(seconds) || 0;
    } catch (error) {
      /* not seekable yet */
    }
  };

  SoundFile.prototype.cue = SoundFile.prototype.jump;

  SoundFile.prototype.duration = function () {
    return this.$element.duration || 0;
  };

  SoundFile.prototype.dur = SoundFile.prototype.duration;

  SoundFile.prototype.set = function () {
    /* channel/rate configuration has no effect on an <audio> element */
  };

  global.SoundFile = SoundFile;
  global.AudioSample = SoundFile;

  // -------------------------------------------------------------------------
  // PApplet
  // -------------------------------------------------------------------------

  // Tabs written as real .java classes call through a `PApplet` parameter and
  // reference constants statically (`PApplet.CENTER`). The instance methods
  // come from the sketch object itself; only the statics need a home.
  var PApplet = global.PApplet || {};
  global.PApplet = PApplet;

  var STATIC_HELPERS = [
    'abs', 'ceil', 'constrain', 'degrees', 'dist', 'floor', 'lerp', 'log',
    'mag', 'map', 'max', 'min', 'nf', 'nfc', 'nfp', 'nfs', 'norm',
    'parseBoolean', 'parseByte', 'parseChar', 'parseFloat', 'parseInt',
    'radians', 'round', 'sq', 'sqrt', 'str', 'trim', 'split', 'splitTokens',
    'join', 'match', 'matchAll', 'binary', 'hex', 'unbinary', 'unhex',
  ];

  function adoptStatics(processing) {
    var constants = processing.PConstants || (global.Processing && global.Processing.prototype.PConstants);

    for (var name in constants) {
      if (Object.prototype.hasOwnProperty.call(constants, name) && !(name in PApplet)) {
        PApplet[name] = constants[name];
      }
    }

    for (var index = 0; index < STATIC_HELPERS.length; index += 1) {
      var helper = STATIC_HELPERS[index];
      if (typeof processing[helper] === 'function' && !(helper in PApplet)) {
        PApplet[helper] = processing[helper].bind(processing);
      }
    }
  }

  // -------------------------------------------------------------------------
  // bootstrap
  // -------------------------------------------------------------------------

  function fetchText(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (response) {
      if (!response.ok) {
        throw new Error('Could not load ' + url + ' (HTTP ' + response.status + ').');
      }
      return response.text();
    });
  }

  /**
   * Fetches the bundle and any tabular data the sketch reads synchronously,
   * then hands the source to Processing.js.
   *
   * @param {{canvas: HTMLCanvasElement, bundleUrl: string, dataBase: string,
   *          tables?: string[], onError?: function(Error)}} options
   */
  function run(options) {
    dataBase = options.dataBase || '';

    var tables = options.tables || [];
    var onError =
      options.onError ||
      function (error) {
        console.error(error);
      };

    var jobs = tables.map(function (name) {
      var key = normalizeName(name);
      var override = readOverride(key);

      if (override !== null) {
        tableCache[key] = override;
        return Promise.resolve();
      }

      return fetchText(dataBase + key)
        .then(function (text) {
          tableCache[key] = text;
        })
        .catch(function () {
          // A missing data file is not fatal: loadTable() yields an empty table.
          tableCache[key] = '';
        });
    });

    return Promise.all([fetchText(options.bundleUrl)].concat(jobs))
      .then(function (results) {
        var source = results[0];

        if (!global.Processing) {
          throw new Error('Processing.js failed to load.');
        }

        silenceOnPageConsole();

        var instance = new global.Processing(options.canvas, source);
        adoptStatics(instance);
        return instance;
      })
      .catch(function (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  /**
   * Sends println() to the browser console instead of Processing.js's overlay.
   *
   * Processing.js ships an on-page console -- a grey bar pinned to the bottom
   * of the viewport with a drag handle and a close button -- and println()
   * writes only there, not to the real console. So a sketch that debug-prints
   * during draw() covers its own output with a panel every player sees, and
   * Java objects arrive as "[object Object]" because the panel string-joins its
   * arguments.
   *
   * Hiding it alone would throw the author's output away, so the logger is
   * rewired rather than suppressed: players get their sketch back, and anyone
   * debugging still sees println() in devtools.
   */
  function silenceOnPageConsole() {
    var logger = global.Processing && global.Processing.logger;
    if (!logger) return;

    var forward = function () {
      if (global.console && global.console.log) {
        global.console.log.apply(global.console, arguments);
      }
    };

    logger.print = forward;
    logger.println = forward;
    // Called by print() itself, and by Processing.js on some errors.
    logger.showconsole = function () {};

    // The panel is appended on first use; if something got in first, hide it.
    if (logger.wrapper && logger.wrapper.classList) {
      logger.wrapper.classList.add('hidden');
    }
  }

  global.ProcessingCompat = {
    run: run,
    Table: Table,
    TableRow: TableRow,
    SoundFile: SoundFile,
    setMasterVolume: setMasterVolume,
  };
})(window);
