'use babel';

import DemParensView from './dem-parens-view';
import {
  CompositeDisposable, Range
}
from 'atom';

export default {

  subscriptions: null,
  decorations: null,
  positionChangeEvent: {},

  config: {
    opacity_instead: {
      type: 'boolean',
      default: false,
      title: 'Use Opacity instead of resizing',
      description: 'Makes farther blocks more transparent instead of smaller'
    },
    distance_multiplier: {
      type: 'number',
      default: 1,
      description: 'The resulting distance is multiplied by this and added to the bias'
    },
    distance_bias: {
      type: 'number',
      default: 0
    }
  },

  activate(state) {
    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
        'dem-parens:start_exec': () => this.start_exec(),
        'dem-parens:stop_exec': () => this.stop_exec(),
      })
    );
  },

  deactivate() {
    this.subscriptions.dispose();
    this.stop_exec();
  },

  serialize() {
    return {};
  },
  stop_exec() {
    if (this.decorations)
      for (variable of this.decorations) {
        variable.destroy();
      }
    this.decorations = null;
    if (this.positionChangeEvent) {
      for (variable in this.positionChangeEvent)
        this.positionChangeEvent[variable].dispose();
      this.positionChangeEvent = {};
    }
  },
  start_exec() {
    console.log('trying to do shit');
    let editor;
    let self = this;
    if (editor = atom.workspace.getActiveTextEditor()) {
      let cursors = editor.getCursorBufferPositions();
      if (!this.positionChangeEvent[editor])
        this.positionChangeEvent[editor] = editor.onDidChangeCursorPosition(t =>
          self.stop_exec() ||
          self.start_exec());

      // for (cursor of cursors) {
      let ranges = [];
      let s = '';
      editor.scan(/\(|\)|\{|\}/g, (obj) => {
        let puncs = editor.scopeDescriptorForBufferPosition(obj.range.start)
          .getScopesArray().filter(scope => scope.includes('source'));
        if (puncs.length > 0) {
          s += obj.matchText;
          ranges.push(obj.range.start);
        }
      });
      let opens = [];
      let popens = [];
      let regions = [];
      let children = {};
      for (var i = 0; i < s.length; i++) {
        switch (s[i]) {
          case '(':
            opens.push(i);
            break;
          case ')':
            var closes = opens.pop();
            var parent = opens[opens.length - 1];
            if (typeof(parent) !== 'undefined') {
              children[parent] = children[parent] || [];
              children[parent].push(regions.length);
            }
            regions.push([ranges[i], ranges[closes], parent, 0]); // start, end, parent, depth
            var ownchildren;
            if (ownchildren = children[closes]) {
              for (let child of ownchildren) {
                regions[child][2] = regions.length - 1;
              }
            }
            break;
          case '{':
            popens.push(i);
            break;
          case '}':
            var closes = popens.pop();
            var parent = popens[opens.length - 1];
            if (typeof(parent) !== 'undefined') {
              children[parent] = children[parent] || [];
              children[parent].push(regions.length);
            }
            regions.push([ranges[i], ranges[closes], parent, 0]); // start, end, parent, depth
            var ownchildren;
            if (ownchildren = children[closes]) {
              for (let child of ownchildren) {
                regions[child][2] = regions.length - 1;
              }
            }
            break;
        }
      }
      while (opens.length > 0) {
        var closes = opens.pop();
        var parent = opens[opens.length - 1];
        if (typeof(parent) !== 'undefined') {
          children[parent] = children[parent] || [];
          children[parent].push(regions.length);
        }
        regions.push([ranges[i], ranges[closes], parent, 0]); // start, end, parent, depth
        var ownchildren;
        if (ownchildren = children[closes]) {
          for (let child of ownchildren) {
            regions[child][2] = regions.length - 1;
          }
        }
      }
      for (let entry of regions.slice().reverse()) {
        if (typeof(entry[2]) !== 'undefined')
          entry[3] += regions[entry[2]][3] + 1;
        entry[0] = new Range(entry[0], entry[1]);
      }
      let references = {};
      let tref = 0;
      for (let entry of regions) {
        for (cursor of cursors)
          if (entry[0].containsPoint(cursor)) {
            references[cursor] = references[cursor] || [];
            references[cursor].push(entry[3]);
          }
      }
      for (reference in references)
        tref += Math.max(...references[reference]);
      tref /= cursors.length;
      let marked = [];
      for (let region of regions) {
        let go = true;
        for (let m of marked)
          if (m[1] && region[0].containsRange(m[0])) {
            go = false;
            break;
          }
        if (go) {
          marker = editor.markBufferRange(region[0])
          let linen = Math.floor(Math.abs(tref - region[3]) * atom.config.get(
            'dem-parens.distance_multiplier', '1') + atom.config.get(
            'dem-parens.distance_bias', '0'));
          linen = Math.min(Math.max(linen, 0), 7)
          decoration = editor.decorateMarker(marker, {
            type: 'line',
            class: `${atom.config.get('dem-parens.opacity_instead', 'false') ? 'line-inner-opacity' : 'line-inner-resize'}-${linen}`
          })
          marked.push([region[0], decoration]);
        }
      }
      this.decorations = marked.filter(t => t[1]).map(t => t[1]);
    }
  }

};
