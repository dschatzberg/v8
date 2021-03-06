// Copyright 2012 the V8 project authors. All rights reserved.
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
//       copyright notice, this list of conditions and the following
//       disclaimer in the documentation and/or other materials provided
//       with the distribution.
//     * Neither the name of Google Inc. nor the names of its
//       contributors may be used to endorse or promote products derived
//       from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

// Flags: --harmony-observation

var allObservers = [];
function reset() {
  allObservers.forEach(function(observer) { observer.reset(); });
}

function createObserver() {
  "use strict";  // So that |this| in callback can be undefined.

  var observer = {
    records: undefined,
    callbackCount: 0,
    reset: function() {
      this.records = undefined;
      this.callbackCount = 0;
    },
    assertNotCalled: function() {
      assertEquals(undefined, this.records);
      assertEquals(0, this.callbackCount);
    },
    assertCalled: function() {
      assertEquals(1, this.callbackCount);
    },
    assertRecordCount: function(count) {
      this.assertCalled();
      assertEquals(count, this.records.length);
    },
    assertCallbackRecords: function(recs) {
      this.assertRecordCount(recs.length);
      for (var i = 0; i < recs.length; i++) {
        assertSame(this.records[i].object, recs[i].object);
        assertEquals('string', typeof recs[i].type);
        assertPropertiesEqual(this.records[i], recs[i]);
      }
    }
  };

  observer.callback = function(r) {
    assertEquals(undefined, this);
    assertEquals('object', typeof r);
    assertTrue(r instanceof Array)
    observer.records = r;
    observer.callbackCount++;
  };

  observer.reset();
  allObservers.push(observer);
  return observer;
}

var observer = createObserver();
assertEquals("function", typeof observer.callback);
var obj = {};

function frozenFunction() {}
Object.freeze(frozenFunction);
var nonFunction = {};
var changeRecordWithAccessor = { type: 'foo' };
var recordCreated = false;
Object.defineProperty(changeRecordWithAccessor, 'name', {
  get: function() {
    recordCreated = true;
    return "bar";
  },
  enumerable: true
})

// Object.observe
assertThrows(function() { Object.observe("non-object", observer.callback); }, TypeError);
assertThrows(function() { Object.observe(obj, nonFunction); }, TypeError);
assertThrows(function() { Object.observe(obj, frozenFunction); }, TypeError);

// Object.unobserve
assertThrows(function() { Object.unobserve(4, observer.callback); }, TypeError);
assertThrows(function() { Object.unobserve(obj, nonFunction); }, TypeError);

// Object.getNotifier
var notifier = Object.getNotifier(obj);
assertSame(notifier, Object.getNotifier(obj));
assertEquals(null, Object.getNotifier(Object.freeze({})));
assertFalse(notifier.hasOwnProperty('notify'));
assertEquals([], Object.keys(notifier));
var notifyDesc = Object.getOwnPropertyDescriptor(notifier.__proto__, 'notify');
assertTrue(notifyDesc.configurable);
assertTrue(notifyDesc.writable);
assertFalse(notifyDesc.enumerable);
assertThrows(function() { notifier.notify({}); }, TypeError);
assertThrows(function() { notifier.notify({ type: 4 }); }, TypeError);
var notify = notifier.notify;
assertThrows(function() { notify.call(undefined, { type: 'a' }); }, TypeError);
assertThrows(function() { notify.call(null, { type: 'a' }); }, TypeError);
assertThrows(function() { notify.call(5, { type: 'a' }); }, TypeError);
assertThrows(function() { notify.call('hello', { type: 'a' }); }, TypeError);
assertThrows(function() { notify.call(false, { type: 'a' }); }, TypeError);
assertThrows(function() { notify.call({}, { type: 'a' }); }, TypeError);
assertFalse(recordCreated);
notifier.notify(changeRecordWithAccessor);
assertFalse(recordCreated);  // not observed yet

// Object.deliverChangeRecords
assertThrows(function() { Object.deliverChangeRecords(nonFunction); }, TypeError);

// Multiple records are delivered.
Object.observe(obj, observer.callback);
notifier.notify({
  type: 'updated',
  name: 'foo',
  expando: 1
});

notifier.notify({
  object: notifier,  // object property is ignored
  type: 'deleted',
  name: 'bar',
  expando2: 'str'
});
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: obj, name: 'foo', type: 'updated', expando: 1 },
  { object: obj, name: 'bar', type: 'deleted', expando2: 'str' }
]);

// No delivery takes place if no records are pending
reset();
Object.deliverChangeRecords(observer.callback);
observer.assertNotCalled();

// Multiple observation has no effect.
reset();
Object.observe(obj, observer.callback);
Object.observe(obj, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo',
});
Object.deliverChangeRecords(observer.callback);
observer.assertCalled();

// Observation can be stopped.
reset();
Object.unobserve(obj, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo',
});
Object.deliverChangeRecords(observer.callback);
observer.assertNotCalled();

// Multiple unobservation has no effect
reset();
Object.unobserve(obj, observer.callback);
Object.unobserve(obj, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo',
});
Object.deliverChangeRecords(observer.callback);
observer.assertNotCalled();

// Re-observation works and only includes changeRecords after of call.
reset();
Object.getNotifier(obj).notify({
  type: 'foo',
});
Object.observe(obj, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo',
});
records = undefined;
Object.deliverChangeRecords(observer.callback);
observer.assertRecordCount(1);

// Observing a continuous stream of changes, while itermittantly unobserving.
reset();
Object.observe(obj, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo',
  val: 1
});

Object.unobserve(obj, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo',
  val: 2
});

Object.observe(obj, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo',
  val: 3
});

Object.unobserve(obj, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo',
  val: 4
});

Object.observe(obj, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo',
  val: 5
});

Object.unobserve(obj, observer.callback);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: obj, type: 'foo', val: 1 },
  { object: obj, type: 'foo', val: 3 },
  { object: obj, type: 'foo', val: 5 }
]);

// Observing multiple objects; records appear in order.
reset();
var obj2 = {};
var obj3 = {}
Object.observe(obj, observer.callback);
Object.observe(obj3, observer.callback);
Object.observe(obj2, observer.callback);
Object.getNotifier(obj).notify({
  type: 'foo1',
});
Object.getNotifier(obj2).notify({
  type: 'foo2',
});
Object.getNotifier(obj3).notify({
  type: 'foo3',
});
Object.observe(obj3, observer.callback);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: obj, type: 'foo1' },
  { object: obj2, type: 'foo2' },
  { object: obj3, type: 'foo3' }
]);

// Observing named properties.
reset();
var obj = {a: 1}
Object.observe(obj, observer.callback);
obj.a = 2;
obj["a"] = 3;
delete obj.a;
obj.a = 4;
obj.a = 4;  // ignored
obj.a = 5;
Object.defineProperty(obj, "a", {value: 6});
Object.defineProperty(obj, "a", {writable: false});
obj.a = 7;  // ignored
Object.defineProperty(obj, "a", {value: 8});
Object.defineProperty(obj, "a", {value: 7, writable: true});
Object.defineProperty(obj, "a", {get: function() {}});
Object.defineProperty(obj, "a", {get: function() {}});
delete obj.a;
delete obj.a;
Object.defineProperty(obj, "a", {get: function() {}, configurable: true});
Object.defineProperty(obj, "a", {value: 9, writable: true});
obj.a = 10;
delete obj.a;
Object.defineProperty(obj, "a", {value: 11, configurable: true});
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: obj, name: "a", type: "updated", oldValue: 1 },
  { object: obj, name: "a", type: "updated", oldValue: 2 },
  { object: obj, name: "a", type: "deleted", oldValue: 3 },
  { object: obj, name: "a", type: "new" },
  { object: obj, name: "a", type: "updated", oldValue: 4 },
  { object: obj, name: "a", type: "updated", oldValue: 5 },
  { object: obj, name: "a", type: "reconfigured", oldValue: 6 },
  { object: obj, name: "a", type: "updated", oldValue: 6 },
  { object: obj, name: "a", type: "reconfigured", oldValue: 8 },
  { object: obj, name: "a", type: "reconfigured", oldValue: 7 },
  { object: obj, name: "a", type: "reconfigured" },
  { object: obj, name: "a", type: "deleted" },
  { object: obj, name: "a", type: "new" },
  { object: obj, name: "a", type: "reconfigured" },
  { object: obj, name: "a", type: "updated", oldValue: 9 },
  { object: obj, name: "a", type: "deleted", oldValue: 10 },
  { object: obj, name: "a", type: "new" },
]);

// Observing indexed properties.
reset();
var obj = {'1': 1}
Object.observe(obj, observer.callback);
obj[1] = 2;
obj[1] = 3;
delete obj[1];
obj[1] = 4;
obj[1] = 4;  // ignored
obj[1] = 5;
Object.defineProperty(obj, "1", {value: 6});
Object.defineProperty(obj, "1", {writable: false});
obj[1] = 7;  // ignored
Object.defineProperty(obj, "1", {value: 8});
Object.defineProperty(obj, "1", {value: 7, writable: true});
Object.defineProperty(obj, "1", {get: function() {}});
delete obj[1];
delete obj[1];
Object.defineProperty(obj, "1", {get: function() {}, configurable: true});
Object.defineProperty(obj, "1", {value: 9, writable: true});
obj[1] = 10;
delete obj[1];
Object.defineProperty(obj, "1", {value: 11, configurable: true});
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: obj, name: "1", type: "updated", oldValue: 1 },
  { object: obj, name: "1", type: "updated", oldValue: 2 },
  { object: obj, name: "1", type: "deleted", oldValue: 3 },
  { object: obj, name: "1", type: "new" },
  { object: obj, name: "1", type: "updated", oldValue: 4 },
  { object: obj, name: "1", type: "updated", oldValue: 5 },
  { object: obj, name: "1", type: "reconfigured", oldValue: 6 },
  { object: obj, name: "1", type: "updated", oldValue: 6 },
  { object: obj, name: "1", type: "reconfigured", oldValue: 8 },
  { object: obj, name: "1", type: "reconfigured", oldValue: 7 },
  // TODO(observe): oldValue should not be present below.
  { object: obj, name: "1", type: "deleted", oldValue: undefined },
  { object: obj, name: "1", type: "new" },
  // TODO(observe): oldValue should be absent below, and type = "reconfigured".
  { object: obj, name: "1", type: "updated", oldValue: undefined },
  { object: obj, name: "1", type: "updated", oldValue: 9 },
  { object: obj, name: "1", type: "deleted", oldValue: 10 },
  { object: obj, name: "1", type: "new" },
]);

// Observing array length (including truncation)
reset();
var arr = ['a', 'b', 'c', 'd'];
var arr2 = ['alpha', 'beta'];
var arr3 = ['hello'];
arr3[2] = 'goodbye';
arr3.length = 6;
// TODO(adamk): Enable this test case when it can run in a reasonable
// amount of time.
//var slow_arr = new Array(1000000000);
//slow_arr[500000000] = 'hello';
Object.defineProperty(arr, '0', {configurable: false});
Object.defineProperty(arr, '2', {get: function(){}});
Object.defineProperty(arr2, '0', {get: function(){}, configurable: false});
Object.observe(arr, observer.callback);
Object.observe(arr2, observer.callback);
Object.observe(arr3, observer.callback);
arr.length = 2;
arr.length = 0;
arr.length = 10;
arr2.length = 0;
arr2.length = 1; // no change expected
arr3.length = 0;
Object.defineProperty(arr3, 'length', {value: 5});
Object.defineProperty(arr3, 'length', {value: 10, writable: false});
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: arr, name: '3', type: 'deleted', oldValue: 'd' },
  // TODO(adamk): oldValue should not be present below
  { object: arr, name: '2', type: 'deleted', oldValue: undefined },
  { object: arr, name: 'length', type: 'updated', oldValue: 4 },
  { object: arr, name: '1', type: 'deleted', oldValue: 'b' },
  { object: arr, name: 'length', type: 'updated', oldValue: 2 },
  { object: arr, name: 'length', type: 'updated', oldValue: 1 },
  { object: arr2, name: '1', type: 'deleted', oldValue: 'beta' },
  { object: arr2, name: 'length', type: 'updated', oldValue: 2 },
  { object: arr3, name: '2', type: 'deleted', oldValue: 'goodbye' },
  { object: arr3, name: '0', type: 'deleted', oldValue: 'hello' },
  { object: arr3, name: 'length', type: 'updated', oldValue: 6 },
  { object: arr3, name: 'length', type: 'updated', oldValue: 0 },
  { object: arr3, name: 'length', type: 'updated', oldValue: 5 },
  // TODO(adamk): This record should be merged with the above
  { object: arr3, name: 'length', type: 'reconfigured' },
]);

// Assignments in loops (checking different IC states).
reset();
var obj = {};
Object.observe(obj, observer.callback);
for (var i = 0; i < 5; i++) {
  obj["a" + i] = i;
}
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: obj, name: "a0", type: "new" },
  { object: obj, name: "a1", type: "new" },
  { object: obj, name: "a2", type: "new" },
  { object: obj, name: "a3", type: "new" },
  { object: obj, name: "a4", type: "new" },
]);

reset();
var obj = {};
Object.observe(obj, observer.callback);
for (var i = 0; i < 5; i++) {
  obj[i] = i;
}
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: obj, name: "0", type: "new" },
  { object: obj, name: "1", type: "new" },
  { object: obj, name: "2", type: "new" },
  { object: obj, name: "3", type: "new" },
  { object: obj, name: "4", type: "new" },
]);

// Adding elements past the end of an array should notify on length
reset();
var arr = [1, 2, 3];
Object.observe(arr, observer.callback);
arr[3] = 10;
arr[100] = 20;
Object.defineProperty(arr, '200', {value: 7});
Object.defineProperty(arr, '400', {get: function(){}});
arr[50] = 30; // no length change expected
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: arr, name: '3', type: 'new' },
  { object: arr, name: 'length', type: 'updated', oldValue: 3 },
  { object: arr, name: '100', type: 'new' },
  { object: arr, name: 'length', type: 'updated', oldValue: 4 },
  { object: arr, name: '200', type: 'new' },
  { object: arr, name: 'length', type: 'updated', oldValue: 101 },
  { object: arr, name: '400', type: 'new' },
  { object: arr, name: 'length', type: 'updated', oldValue: 201 },
  { object: arr, name: '50', type: 'new' },
]);

// Tests for array methods, first on arrays and then on plain objects
//
// === ARRAYS ===
//
// Push
reset();
var array = [1, 2];
Object.observe(array, observer.callback);
array.push(3, 4);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '2', type: 'new' },
  { object: array, name: 'length', type: 'updated', oldValue: 2 },
  { object: array, name: '3', type: 'new' },
  { object: array, name: 'length', type: 'updated', oldValue: 3 },
]);

// Pop
reset();
var array = [1, 2];
Object.observe(array, observer.callback);
array.pop();
array.pop();
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '1', type: 'deleted', oldValue: 2 },
  { object: array, name: 'length', type: 'updated', oldValue: 2 },
  { object: array, name: '0', type: 'deleted', oldValue: 1 },
  { object: array, name: 'length', type: 'updated', oldValue: 1 },
]);

// Shift
reset();
var array = [1, 2];
Object.observe(array, observer.callback);
array.shift();
array.shift();
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '0', type: 'updated', oldValue: 1 },
  { object: array, name: '1', type: 'deleted', oldValue: 2 },
  { object: array, name: 'length', type: 'updated', oldValue: 2 },
  { object: array, name: '0', type: 'deleted', oldValue: 2 },
  { object: array, name: 'length', type: 'updated', oldValue: 1 },
]);

// Unshift
reset();
var array = [1, 2];
Object.observe(array, observer.callback);
array.unshift(3, 4);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '3', type: 'new' },
  { object: array, name: 'length', type: 'updated', oldValue: 2 },
  { object: array, name: '2', type: 'new' },
  { object: array, name: '0', type: 'updated', oldValue: 1 },
  { object: array, name: '1', type: 'updated', oldValue: 2 },
]);

// Splice
reset();
var array = [1, 2, 3];
Object.observe(array, observer.callback);
array.splice(1, 1, 4, 5);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '3', type: 'new' },
  { object: array, name: 'length', type: 'updated', oldValue: 3 },
  { object: array, name: '1', type: 'updated', oldValue: 2 },
  { object: array, name: '2', type: 'updated', oldValue: 3 },
]);

//
// === PLAIN OBJECTS ===
//
// Push
reset()
var array = {0: 1, 1: 2, length: 2}
Object.observe(array, observer.callback);
Array.prototype.push.call(array, 3, 4);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '2', type: 'new' },
  { object: array, name: '3', type: 'new' },
  { object: array, name: 'length', type: 'updated', oldValue: 2 },
]);

// Pop
reset()
var array = {0: 1, 1: 2, length: 2};
Object.observe(array, observer.callback);
Array.prototype.pop.call(array);
Array.prototype.pop.call(array);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '1', type: 'deleted', oldValue: 2 },
  { object: array, name: 'length', type: 'updated', oldValue: 2 },
  { object: array, name: '0', type: 'deleted', oldValue: 1 },
  { object: array, name: 'length', type: 'updated', oldValue: 1 },
]);

// Shift
reset()
var array = {0: 1, 1: 2, length: 2};
Object.observe(array, observer.callback);
Array.prototype.shift.call(array);
Array.prototype.shift.call(array);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '0', type: 'updated', oldValue: 1 },
  { object: array, name: '1', type: 'deleted', oldValue: 2 },
  { object: array, name: 'length', type: 'updated', oldValue: 2 },
  { object: array, name: '0', type: 'deleted', oldValue: 2 },
  { object: array, name: 'length', type: 'updated', oldValue: 1 },
]);

// Unshift
reset()
var array = {0: 1, 1: 2, length: 2};
Object.observe(array, observer.callback);
Array.prototype.unshift.call(array, 3, 4);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '3', type: 'new' },
  { object: array, name: '2', type: 'new' },
  { object: array, name: '0', type: 'updated', oldValue: 1 },
  { object: array, name: '1', type: 'updated', oldValue: 2 },
  { object: array, name: 'length', type: 'updated', oldValue: 2 },
]);

// Splice
reset()
var array = {0: 1, 1: 2, 2: 3, length: 3};
Object.observe(array, observer.callback);
Array.prototype.splice.call(array, 1, 1, 4, 5);
Object.deliverChangeRecords(observer.callback);
observer.assertCallbackRecords([
  { object: array, name: '3', type: 'new' },
  { object: array, name: '1', type: 'updated', oldValue: 2 },
  { object: array, name: '2', type: 'updated', oldValue: 3 },
  { object: array, name: 'length', type: 'updated', oldValue: 3 },
]);
