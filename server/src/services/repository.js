import { dbState } from "../config/db.js";
import { Application } from "../models/Application.js";
import { Internship } from "../models/Internship.js";
import { Match } from "../models/Match.js";
import { Notification } from "../models/Notification.js";
import { Profile } from "../models/Profile.js";
import { ResumeHistory } from "../models/ResumeHistory.js";
import { ResumeVersion } from "../models/ResumeVersion.js";
import { User } from "../models/User.js";
import * as memoryStore from "./memoryStore.js";

const modelMap = {
  users: User,
  profiles: Profile,
  internships: Internship,
  matches: Match,
  resumeVersions: ResumeVersion,
  resumeHistory: ResumeHistory,
  applications: Application,
  notifications: Notification
};

function asObject(document) {
  if (!document) return null;
  return typeof document.toObject === "function" ? document.toObject() : document;
}

function modelFor(collection) {
  const model = modelMap[collection];
  if (!model) throw new Error(`Unknown repository collection: ${collection}`);
  return model;
}

function assertStorageAvailable() {
  if (dbState.mode === "error") {
    throw new Error("Persistence is unavailable because the configured MongoDB connection failed.");
  }
}

function sameValue(left, right) {
  if (left instanceof Date || right instanceof Date) return new Date(left).getTime() === new Date(right).getTime();
  if (left && typeof left === "object" && "_id" in left) left = left._id;
  if (right && typeof right === "object" && "_id" in right) right = right._id;
  if (left != null && right != null && typeof left !== "object" && typeof right !== "object") {
    return String(left) === String(right);
  }
  return Object.is(left, right);
}

function matchesCondition(value, condition) {
  if (!condition || typeof condition !== "object" || condition instanceof Date || Array.isArray(condition)) {
    return sameValue(value, condition);
  }
  return Object.entries(condition).every(([operator, expected]) => {
    switch (operator) {
      case "$in": return expected.some((item) => sameValue(value, item));
      case "$nin": return expected.every((item) => !sameValue(value, item));
      case "$ne": return !sameValue(value, expected);
      case "$gte": return new Date(value).getTime() >= new Date(expected).getTime();
      case "$lte": return new Date(value).getTime() <= new Date(expected).getTime();
      case "$gt": return new Date(value).getTime() > new Date(expected).getTime();
      case "$lt": return new Date(value).getTime() < new Date(expected).getTime();
      case "$exists": return expected ? value !== undefined : value === undefined;
      default: return sameValue(value?.[operator], expected);
    }
  });
}

function matchesFilter(record, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return condition.some((item) => matchesFilter(record, item));
    if (key === "$and") return condition.every((item) => matchesFilter(record, item));
    return matchesCondition(record[key], condition);
  });
}

function memoryMatches(collection, filter) {
  return (record) => matchesFilter(record, filter);
}

function sortRecords(records, sort) {
  const entries = Object.entries(sort);
  if (!entries.length) return records;
  return records.sort((left, right) => {
    for (const [key, direction] of entries) {
      const a = left[key] instanceof Date ? left[key].getTime() : left[key];
      const b = right[key] instanceof Date ? right[key].getTime() : right[key];
      if (a == null && b != null) return direction < 0 ? 1 : -1;
      if (b == null && a != null) return direction < 0 ? -1 : 1;
      if (a < b) return direction < 0 ? 1 : -1;
      if (a > b) return direction < 0 ? -1 : 1;
    }
    return 0;
  });
}

// All persistence operations share the same interface in memory and MongoDB modes.

export async function getAll(collection, filter = {}, sort = {}) {
  assertStorageAvailable();
  if (dbState.mode === "mongo") return modelFor(collection).find(filter).sort(sort).lean().exec();
  return sortRecords(memoryStore.findMany(collection, memoryMatches(collection, filter)), sort);
}

export async function getById(collection, id) {
  assertStorageAvailable();
  if (dbState.mode === "mongo") return modelFor(collection).findById(id).lean().exec();
  return memoryStore.findById(collection, id);
}

export async function getOne(collection, filter = {}, options = {}) {
  assertStorageAvailable();
  if (dbState.mode === "mongo") {
    let query = modelFor(collection).findOne(filter);
    if (options.select) query = query.select(options.select);
    return query.lean().exec();
  }
  return memoryStore.findOne(collection, memoryMatches(collection, filter));
}

export async function create(collection, data) {
  assertStorageAvailable();
  if (dbState.mode === "mongo") return asObject(await modelFor(collection).create(data));
  return memoryStore.insertOne(collection, data);
}

export async function updateById(collection, id, data) {
  assertStorageAvailable();
  if (dbState.mode === "mongo") {
    return modelFor(collection).findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean().exec();
  }
  return memoryStore.updateOne(collection, id, data);
}

export async function upsert(collection, filter, createData, updateData = {}) {
  assertStorageAvailable();
  if (dbState.mode === "mongo") {
    const model = modelFor(collection);
    const insertOnly = Object.fromEntries(Object.entries(createData).filter(([key]) => !(key in updateData)));
    try {
      return await model
        .findOneAndUpdate(filter, { $set: updateData, $setOnInsert: insertOnly }, {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true
        })
        .lean()
        .exec();
    } catch (error) {
      if (collection !== "internships" || error?.code !== 11000) throw error;
      // Another request may have inserted the indexed internship after this
      // upsert's lookup. Return that winner instead of failing the API request.
      const existing = await model.findOne(filter).lean().exec();
      if (existing) return existing;
      throw error;
    }
  }
  return memoryStore.upsertOne(collection, memoryMatches(collection, filter), createData, updateData);
}

export async function deleteById(collection, id) {
  assertStorageAvailable();
  if (dbState.mode === "mongo") return (await modelFor(collection).deleteOne({ _id: id }).exec()).deletedCount;
  return memoryStore.removeMany(collection, (record) => String(record._id) === String(id));
}

export async function deleteWhere(collection, filter = {}) {
  assertStorageAvailable();
  if (dbState.mode === "mongo") return (await modelFor(collection).deleteMany(filter).exec()).deletedCount;
  return memoryStore.removeMany(collection, memoryMatches(collection, filter));
}
