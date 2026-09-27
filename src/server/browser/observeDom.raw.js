(() => {
  var cssPath = function (el) {
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      var selector = node.nodeName.toLowerCase();
      if (node.id) {
        parts.unshift('#' + CSS.escape(node.id));
        break;
      }
      var className =
        typeof node.className === 'string'
          ? node.className.trim().split(/\s+/).filter(Boolean)[0]
          : '';
      if (className) selector += '.' + CSS.escape(className);
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function (c) {
          return c.nodeName === node.nodeName;
        });
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        }
      }
      parts.unshift(selector);
      node = parent;
    }
    return parts.join(' > ');
  };

  var visible = function (el) {
    var style = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width + rect.height > 0;
  };

  var inferPurpose = function (el, type, name) {
    var blob = (
      type +
      ' ' +
      name +
      ' ' +
      (el.getAttribute('autocomplete') || '') +
      ' ' +
      (el.getAttribute('name') || '') +
      ' ' +
      (el.id || '')
    ).toLowerCase();
    if (type === 'password' || blob.indexOf('password') !== -1) return 'password';
    if (blob.indexOf('email') !== -1 || blob.indexOf('user') !== -1 || blob.indexOf('login') !== -1) {
      return 'username';
    }
    if (blob.indexOf('search') !== -1) return 'search';
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || type === 'submit') return 'action';
    if (el.tagName === 'A') return 'navigation';
    if (el.tagName === 'SELECT') return 'select';
    if (type === 'checkbox' || type === 'radio') return 'toggle';
    if (
      ['text', 'email', 'tel', 'number', 'search', 'url'].indexOf(type) !== -1 ||
      el.tagName === 'TEXTAREA' ||
      el.getAttribute('role') === 'textbox'
    ) {
      return 'input';
    }
    return 'control';
  };

  var headingContext = function (el) {
    var headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]'));
    var before = headings.filter(function (h) {
      return (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    var last = before[before.length - 1];
    return ((last && last.textContent) || '').trim().slice(0, 80);
  };

  var collectNodes = function (root, selector) {
    var found = Array.from(root.querySelectorAll(selector));
    var all = root.querySelectorAll('*');
    for (var s = 0; s < all.length; s++) {
      if (all[s].shadowRoot) {
        found = found.concat(collectNodes(all[s].shadowRoot, selector));
      }
    }
    return found;
  };

  var controls = [];
  var selectorSet = {};
  var TABLE_HOST = 'table, [role="table"], [role="grid"], [role="treegrid"], [role="rowgroup"], tbody';
  var ROW_ACTION_SEL =
    'button, a[href], [role="button"], [role="menuitem"], input[type="button"], input[type="submit"], input[type="checkbox"], [role="checkbox"]';

  var inTableHost = function (el) {
    return !!(el.closest && (el.closest(TABLE_HOST) || el.closest('[role="row"]') || el.closest('tr')));
  };

  var nodes = collectNodes(
    document,
    'input:not([type="hidden"]), textarea, select, button, a[href], [role="button"], [role="textbox"], [role="link"], [role="checkbox"], [role="combobox"], [contenteditable="true"]'
  ).filter(function (el) {
    return visible(el) && !inTableHost(el);
  });

  for (var i = 0; i < nodes.length && controls.length < 80; i++) {
    var el = nodes[i];
    var selector = cssPath(el);
    if (selectorSet[selector]) continue;
    selectorSet[selector] = true;
    var inputType = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
    var labelEl = el.labels && el.labels[0];
    var accessibleName =
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      (labelEl && labelEl.innerText) ||
      el.innerText ||
      el.getAttribute('name') ||
      el.id ||
      '';
    var name = accessibleName.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!name) name = (inputType || 'control') + ' ' + (controls.length + 1);
    controls.push({
      id: 'ctrl-' + (controls.length + 1),
      type: inputType,
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      visibleText: name,
      accessibleName: name,
      semanticPurpose: inferPurpose(el, inputType, name),
      pageContext: document.title,
      headingContext: headingContext(el),
      attributes: {
        name: el.getAttribute('name') || '',
        id: el.id || '',
        href: el.getAttribute('href') || '',
      },
      enabled: !el.disabled,
      visible: true,
      selectorFallback: selector,
    });
  }

  var cleanText = function (value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  };

  var cellValue = function (cell) {
    if (!cell) return '';
    var clone = cell.cloneNode(true);
    Array.from(clone.querySelectorAll(ROW_ACTION_SEL + ', svg, img')).forEach(function (n) {
      n.parentNode && n.parentNode.removeChild(n);
    });
    return cleanText(clone.textContent);
  };

  var actionControlType = function (act) {
    var role = (act.getAttribute('role') || '').toLowerCase();
    var tag = act.tagName.toLowerCase();
    var type = (act.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox' || role === 'checkbox' || role === 'switch') return 'checkbox';
    if (tag === 'a' || role === 'link') return 'link';
    return 'button';
  };

  var actionLabel = function (act) {
    var type = (act.getAttribute('type') || '').toLowerCase();
    var raw =
      act.getAttribute('aria-label') ||
      act.getAttribute('title') ||
      act.getAttribute('data-action') ||
      act.getAttribute('data-intent') ||
      act.getAttribute('value') ||
      '';
    if (!raw) {
      var texts = [];
      for (var n = 0; n < act.childNodes.length; n++) {
        if (act.childNodes[n].nodeType === 3) texts.push(act.childNodes[n].textContent || '');
      }
      raw = cleanText(texts.join(' '));
    }
    if (!raw) raw = cleanText(act.textContent);
    if (!raw && (type === 'checkbox' || act.getAttribute('role') === 'checkbox')) raw = 'Select row';
    if (!raw) raw = 'Row action';
    return raw.slice(0, 80);
  };

  var extractRows = function (host, tIdx, rowEls, cellSelector, headerTexts) {
    var columns = headerTexts.filter(Boolean);
    if (!columns.length && rowEls[0]) {
      var firstCells = Array.from(rowEls[0].querySelectorAll(cellSelector));
      columns = firstCells.map(function (cell, idx) {
        var heading = cell.getAttribute('aria-colindex') || cell.getAttribute('data-column');
        return heading || 'Column ' + (idx + 1);
      });
    }
    var rows = rowEls.slice(0, 50).map(function (row, rIdx) {
      var cells = Array.from(row.querySelectorAll(cellSelector));
      var cellMap = {};
      cells.forEach(function (cell, cIdx) {
        var key = columns[cIdx] || 'Column ' + (cIdx + 1);
        if (!columns[cIdx]) columns[cIdx] = key;
        cellMap[key] = cellValue(cell);
      });
      var actions = Array.from(row.querySelectorAll(ROW_ACTION_SEL)).filter(visible).map(function (act, aIdx) {
        var text = actionLabel(act);
        var kind = actionControlType(act);
        return {
          id: 't' + tIdx + '-r' + rIdx + '-a' + aIdx,
          intent: text,
          visibleText: text,
          role: kind,
          targetId: 't' + tIdx + '-r' + rIdx,
          selectorFallback: cssPath(act),
          controlType: kind,
        };
      });
      var firstValue = columns.map(function (col) { return cellMap[col]; }).filter(Boolean)[0];
      return {
        rowId: (firstValue || 'row-' + (rIdx + 1)).slice(0, 40),
        cells: cellMap,
        actions: actions,
        rawIndex: rIdx,
      };
    });
    return { columns: columns, rows: rows };
  };

  var tableFromHost = function (host, tIdx) {
    var caption = '';
    var headerTexts = [];
    var rowEls = [];
    var cellSelector = 'th,td,[role="gridcell"],[role="cell"],[role="columnheader"]';

    if (host.tagName === 'TABLE') {
      caption = cleanText((host.querySelector('caption') && host.querySelector('caption').textContent) || '');
      headerTexts = Array.from(host.querySelectorAll('thead th, thead td, tr:first-child th')).map(function (h) {
        return cellValue(h) || cleanText(h.textContent);
      });
      var bodyRows = Array.from(host.querySelectorAll('tbody tr'));
      rowEls = bodyRows.length
        ? bodyRows
        : Array.from(host.querySelectorAll('tr')).slice(headerTexts.length ? 1 : 0);
      cellSelector = 'th,td';
    } else {
      caption = host.getAttribute('aria-label') || host.getAttribute('data-name') || '';
      headerTexts = Array.from(host.querySelectorAll('[role="columnheader"]')).map(function (h) {
        return cellValue(h) || cleanText(h.textContent);
      });
      rowEls = Array.from(host.querySelectorAll('[role="row"]')).filter(function (row) {
        return !row.querySelector('[role="columnheader"]');
      });
      if (!rowEls.length) {
        rowEls = Array.from(host.children).filter(function (child) {
          return child.querySelector(ROW_ACTION_SEL) || child.children.length >= 3;
        });
        cellSelector = ':scope > *';
      }
    }

    var extracted = extractRows(host, tIdx, rowEls, cellSelector, headerTexts);
    if (!extracted.rows.length) return null;
    return {
      id: 'table-' + (tIdx + 1),
      semanticName: (caption || extracted.columns[0] || 'Table').slice(0, 80),
      columns: extracted.columns,
      rows: extracted.rows,
      totalRows: extracted.rows.length,
      currentPage: 1,
      hasPagination: !!(host.querySelector('[aria-label*="next" i], .pagination, [class*="pager"]')),
    };
  };

  var hosts = collectNodes(document, TABLE_HOST);
  var seenHosts = {};
  var tables = [];
  hosts.forEach(function (host) {
    if (seenHosts[cssPath(host)]) return;
    seenHosts[cssPath(host)] = true;
    var table = tableFromHost(host, tables.length);
    if (table) tables.push(table);
  });

  if (!tables.length) {
    var candidates = Array.from(document.querySelectorAll('div, section, main, ul')).filter(function (el) {
      if (!visible(el) || el.children.length < 3) return false;
      var kids = Array.from(el.children);
      var similar = kids.filter(function (k) {
        return k.children.length >= 3 && k.querySelector(ROW_ACTION_SEL);
      });
      return similar.length >= 3 && similar.length >= kids.length * 0.5;
    }).slice(0, 2);
    candidates.forEach(function (host) {
      var table = tableFromHost(host, tables.length);
      if (table) tables.push(table);
    });
  }

  tables = tables.slice(0, 5);

  var headings = Array.from(document.querySelectorAll('h1,h2,h3'))
    .map(function (h) {
      return (h.textContent || '').replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean)
    .slice(0, 12);

  var snippets = Array.from(document.querySelectorAll('p,label,.alert,[role="alert"],[role="status"]'))
    .map(function (n) {
      return (n.textContent || '').replace(/\s+/g, ' ').trim();
    })
    .filter(function (t) {
      return t.length > 8 && t.length < 160;
    })
    .slice(0, 12);

  return {
    title: document.title,
    headings: headings,
    snippets: snippets,
    controls: controls,
    tables: tables,
  };
})();
