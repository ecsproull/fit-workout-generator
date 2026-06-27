import { Encoder, Profile } from '@garmin/fitsdk'
import { z } from 'zod'

const swimStrokeValues = ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'drill', 'mixed', 'im', 'imByRound', 'rimo']
const intensityValues = ['active', 'rest', 'warmup', 'cooldown', 'recovery', 'interval']
const durationValues = ['time', 'distance']
const strokeToFitValue = {
  freestyle: 0,
  backstroke: 1,
  breaststroke: 2,
  butterfly: 3,
  drill: 4,
  mixed: 5,
  im: 6,
  imByRound: 7,
  rimo: 8,
}

const durationSchema = z
  .object({
    kind: z.enum(durationValues),
    value: z.number().finite().positive(),
  })
  .strict()

const zoneValueSchema = z.union([z.number().int().min(1).max(5), z.enum(['X', 'Y'])])

const workoutEquipmentValues = ['none', 'swimFins', 'swimKickboard', 'swimPaddles', 'swimPullBuoy', 'swimSnorkel']

const paceTargetSchema = z
  .object({
    kind: z.literal('pace'),
    value: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Pace must match MM:SS, for example 01:45.'),
  })
  .strict()

const swimStepSchema = z
  .object({
    kind: z.literal('swim'),
    label: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    duration: durationSchema,
    stroke: z.enum(swimStrokeValues).default('freestyle'),
    intensity: z.enum(intensityValues).default('active'),
    target: paceTargetSchema.optional(),
    zone: zoneValueSchema.optional(),
  })
  .strict()

const restStepSchema = z
  .object({
    kind: z.literal('rest'),
    label: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    duration: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('time'),
          value: z.number().finite().positive(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('lapButton'),
        })
        .strict(),
      z
        .object({
          kind: z.literal('open'),
        })
        .strict(),
    ]),
    intensity: z.enum(intensityValues).default('rest'),
  })
  .strict()

const stepSchema = z.lazy(() => z.discriminatedUnion('kind', [swimStepSchema, restStepSchema, repeatStepSchema]))

const repeatStepSchema = z
  .object({
    kind: z.literal('repeat'),
    label: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    times: z.number().int().min(2),
    steps: z.array(stepSchema).min(1),
  })
  .strict()

const workoutSchema = z
  .object({
    version: z.number().int().min(1).optional(),
    name: z.string().trim().min(1).max(80),
    sport: z.literal('swimming'),
    subSport: z.literal('lapSwimming'),
    poolLength: z.number().finite().positive(),
    poolLengthUnit: z.enum(['meters', 'yards']),
    // Top-level notes (mapped to FIT wktDescription). Accepts user-provided notes.
    notes: z.string().trim().optional(),
    // Optional equipment hint (mapped to FIT workout.equipment). Valid values per FIT definition.
    equipment: z.enum(workoutEquipmentValues).optional(),
    steps: z.array(stepSchema).min(1).max(40),
  })
  .strict()

export const defaultWorkoutJson = `{
  "name": "Pool Main Set",
  "sport": "swimming",
  "subSport": "lapSwimming",
  "poolLength": 25,
  "poolLengthUnit": "meters",
  "notes": "Simple pool workout for USB export.",
  "equipment": "none",
  "steps": [
    {
      "kind": "swim",
      "label": "Warm up",
      "duration": { "kind": "distance", "value": 200 },
      "stroke": "freestyle",
      "intensity": "warmup"
    },
    {
      "kind": "repeat",
      "label": "Main set",
      "times": 4,
      "steps": [
        {
          "kind": "swim",
          "label": "Fast 100",
          "duration": { "kind": "distance", "value": 100 },
          "stroke": "freestyle",
          "intensity": "interval"
        },
        {
          "kind": "rest",
          "label": "Recover",
          "duration": { "kind": "time", "value": 30 },
          "intensity": "rest"
        }
      ]
    },
    {
      "kind": "swim",
      "label": "Cool down",
      "duration": { "kind": "distance", "value": 100 },
      "stroke": "freestyle",
      "intensity": "cooldown"
    }
  ]
}`

function mapPoolLengthUnit(unit) {
  // FIT displayMeasure: 0 = metric, 1 = statute (yards). Use numeric codes.
  return unit === 'yards' ? 1 : 0
}

function humanizeStep(step, index) {
  if (step.label) {
    // append any runtime target/zone info to the label
    const extras = []
    if (step.target && step.target.kind === 'pace' && typeof step.target.value === 'string') extras.push(`pace ${step.target.value}`)
    if (step.zone !== undefined && step.zone !== null) extras.push(`zone ${step.zone}`)

    return extras.length > 0 ? `${step.label} (${extras.join(', ')})` : step.label
  }

  if (step.kind === 'repeat') {
    return `Repeat ${index + 1}`
  }

  const base = `${step.kind === 'rest' ? 'Rest' : 'Swim'} ${index + 1}`
  const extras = []
  if (step.target && step.target.kind === 'pace' && typeof step.target.value === 'string') extras.push(`pace ${step.target.value}`)
  if (step.zone !== undefined && step.zone !== null) extras.push(`zone ${step.zone}`)

  return extras.length > 0 ? `${base} (${extras.join(', ')})` : base
}

function flattenSteps(steps, output = []) {
  for (const step of steps) {
    if (step.kind === 'repeat') {
      for (let repeatIndex = 0; repeatIndex < step.times; repeatIndex += 1) {
        flattenSteps(step.steps, output)
      }

      continue
    }

    output.push(step)
  }

  return output
}

function sumDistance(steps, options = { expandRepeats: true }) {
  let total = 0

  steps.forEach((step) => {
    if (step.kind === 'repeat') {
      const repeatCount = options.expandRepeats ? step.times : 1
      total += repeatCount * sumDistance(step.steps, options)
      return
    }

    if (step.duration.kind === 'distance') {
      total += step.duration.value
    }
  })

  return total
}

function collectSemanticIssues(workout) {
  const warnings = []

  const flatSteps = flattenSteps(workout.steps)

  if (flatSteps.length > 30) {
    warnings.push({
      path: ['steps'],
      message: 'Garmin watches often prefer shorter workouts; long files are still valid but may be harder to review.',
    })
  }

  const visit = (steps, path = []) => {
    steps.forEach((step, index) => {
      const nextPath = [...path, 'steps', index]

      if (step.kind === 'repeat') {
        if (step.times > 12) {
          warnings.push({
            path: [...nextPath, 'times'],
            message: 'A large repeat count may be cumbersome on-device. Consider flattening very long sets.',
          })
        }

        visit(step.steps, nextPath)
        return
      }

      if (step.kind === 'swim' && step.duration.kind === 'distance' && workout.poolLength > 0) {
        const ratio = step.duration.value / workout.poolLength

        if (!Number.isInteger(ratio)) {
          warnings.push({
            path: [...nextPath, 'duration', 'value'],
            message: `Distance ${step.duration.value} does not evenly divide the ${workout.poolLength} ${workout.poolLengthUnit} pool length.`,
          })
        }
      }

      // Target and zone are recorded in the step name so they are visible on-device.
    })
  }

  visit(workout.steps)

  return warnings
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item))
  }

  if (value && typeof value === 'object') {
    const result = {}
    Object.entries(value).forEach(([key, inner]) => {
      result[key] = cloneValue(inner)
    })
    return result
  }

  return value
}

function isNumericString(value) {
  return typeof value === 'string' && /^[-+]?\d+(\.\d+)?$/.test(value.trim())
}

function coerceNumberLike(input, path, warnings, options = {}) {
  if (typeof input !== 'string') {
    return input
  }

  const trimmed = input.trim()
  if (!isNumericString(trimmed)) {
    return input
  }

  const numberValue = Number(trimmed)
  if (!Number.isFinite(numberValue)) {
    return input
  }

  if (options.integer && !Number.isInteger(numberValue)) {
    return input
  }

  if (options.min !== undefined && numberValue < options.min) {
    return input
  }

  if (options.max !== undefined && numberValue > options.max) {
    return input
  }

  warnings.push({
    path,
    message: `Converted string "${input}" to number ${numberValue}.`,
  })

  return numberValue
}

function coerceZoneLike(input, path, warnings) {
  if (typeof input === 'number') {
    return input
  }

  if (typeof input !== 'string') {
    return input
  }

  const trimmed = input.trim()
  const numeric = trimmed.match(/^([1-5])$/)
  if (numeric) {
    const value = Number(numeric[1])
    warnings.push({
      path,
      message: `Converted zone string "${input}" to number ${value}.`,
    })
    return value
  }

  const symbolic = trimmed.toLowerCase().match(/^(?:z|zone)\s*([1-5])$/)
  if (symbolic) {
    const value = Number(symbolic[1])
    warnings.push({
      path,
      message: `Converted zone string "${input}" to number ${value}.`,
    })
    return value
  }

  const xy = trimmed.toUpperCase().match(/^(?:ZONE\s*)?([XY])$/)
  if (xy) {
    const value = xy[1]
    if (trimmed !== value) {
      warnings.push({
        path,
        message: `Normalized zone string "${input}" to "${value}".`,
      })
    }
    return value
  }

  return input
}

function normalizeStep(step, path, warnings) {
  if (!step || typeof step !== 'object') {
    return
  }

  if (step.duration && typeof step.duration === 'object' && Object.prototype.hasOwnProperty.call(step.duration, 'value')) {
    step.duration.value = coerceNumberLike(
      step.duration.value,
      [...path, 'duration', 'value'],
      warnings,
      { min: 0.0000001 },
    )
  }

  if (step.kind === 'repeat') {
    step.times = coerceNumberLike(step.times, [...path, 'times'], warnings, {
      integer: true,
      min: 2,
    })

    if (Array.isArray(step.steps)) {
      step.steps.forEach((innerStep, index) => normalizeStep(innerStep, [...path, 'steps', index], warnings))
    }
  }

  if (step.kind === 'swim') {
    step.zone = coerceZoneLike(step.zone, [...path, 'zone'], warnings)
  }
}

function normalizeWorkoutDraft(parsedDraft) {
  const normalized = cloneValue(parsedDraft)
  const warnings = []

  if (!normalized || typeof normalized !== 'object') {
    return { normalized, warnings }
  }

  normalized.version = coerceNumberLike(normalized.version, ['version'], warnings, {
    integer: true,
    min: 1,
  })

  normalized.poolLength = coerceNumberLike(normalized.poolLength, ['poolLength'], warnings, {
    min: 0.0000001,
  })

  if (Array.isArray(normalized.steps)) {
    normalized.steps.forEach((step, index) => normalizeStep(step, ['steps', index], warnings))
  }

  return { normalized, warnings }
}

// Migrate older/legacy shapes to the current schema
function migrateLegacyShapes(obj) {
  if (Array.isArray(obj)) return obj.map(migrateLegacyShapes)
  if (!obj || typeof obj !== 'object') return obj

  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    let k = key
    let v = value

    if (k === 'type' && !('kind' in obj)) {
      k = 'kind'
    }

    if (k === 'repeat' && !('times' in obj)) {
      // convert { repeat: N } -> { times: N }
      out['times'] = v
      continue
    }

    // Accept top-level `description` as an alias for `notes` in legacy/alternate drafts
    if (k === 'description' && !('notes' in obj)) {
      out['notes'] = migrateLegacyShapes(v)
      continue
    }

    // recurse into nested objects/arrays
    out[k] = migrateLegacyShapes(v)
  }

  // Some legacy steps used a top-level `distance` number instead of a `duration` object
  if (!('duration' in out) && 'distance' in obj) {
    const val = obj.distance
    if (typeof val === 'number' || (typeof val === 'string' && isNumericString(val))) {
      out.duration = { kind: 'distance', value: Number(val) }
    }
  }

  return out
}

function formatZodIssues(error) {
  const issues = []

  const pathToText = (path) => {
    if (!path || path.length === 0) {
      return ''
    }

    return path.reduce((acc, part) => {
      if (typeof part === 'number') {
        return `${acc}[${part}]`
      }

      return acc.length === 0 ? String(part) : `${acc}.${String(part)}`
    }, '')
  }

  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)) {
      issue.keys.forEach((key) => {
        issues.push({
          path: [...issue.path, key],
          message: `Unrecognized key "${key}".`,
        })
      })
      continue
    }

    if (issue.code === 'invalid_union' && Array.isArray(issue.errors)) {
      const isZonePath = issue.path.length > 0 && issue.path[issue.path.length - 1] === 'zone'
      if (isZonePath) {
        issues.push({
          path: issue.path,
          message: 'Zone must be 1-5, X, or Y. String forms like "2", "Z2", "zone2", "X", "Y", and "zone y" are accepted.',
        })
        continue
      }

      const nested = issue.errors.flat()
      nested.forEach((nestedIssue) => {
        issues.push({
          path: nestedIssue.path.length > 0 ? nestedIssue.path : issue.path,
          message: nestedIssue.message,
        })
      })
      continue
    }

    if (issue.code === 'invalid_union_discriminator') {
      issues.push({
        path: issue.path,
        message: 'Invalid step kind. Expected one of: swim, rest, repeat.',
      })
      continue
    }

    if (issue.code === 'invalid_type' && 'expected' in issue && 'received' in issue) {
      const isZonePath = issue.path.length > 0 && issue.path[issue.path.length - 1] === 'zone'
      if (isZonePath) {
        issues.push({
          path: issue.path,
          message: `Zone must be 1-5, X, or Y. String forms like "2", "Z2", "zone2", "X", "Y", and "zone y" are accepted. Received ${issue.received}.`,
        })
        continue
      }

      issues.push({
        path: issue.path,
        message: `Expected ${issue.expected}, received ${issue.received}.`,
      })
      continue
    }

    if (issue.code === 'invalid_value' && 'values' in issue && Array.isArray(issue.values)) {
      const expected = issue.values.map((value) => JSON.stringify(value)).join(', ')
      issues.push({
        path: issue.path,
        message: `Invalid value. Expected one of: ${expected}.`,
      })
      continue
    }

    issues.push({
      path: issue.path,
      message: issue.message,
    })
  }

  const uniqueIssues = new Map()
  issues.forEach((item) => {
    const key = `${pathToText(item.path)}::${item.message}`
    if (!uniqueIssues.has(key)) {
      uniqueIssues.set(key, item)
    }
  })

  return Array.from(uniqueIssues.values())
}

export function parseWorkoutDraft(draft) {
  let parsed

  try {
    parsed = JSON.parse(draft)
  } catch (error) {
    return {
      workout: null,
      errors: [
        {
          path: [],
          message: error instanceof Error ? `Invalid JSON: ${error.message}` : 'Invalid JSON.',
        },
      ],
      warnings: [],
    }
  }

  // Accept and migrate some legacy shapes (e.g., `type` -> `kind`, `distance` -> `duration`)
  parsed = migrateLegacyShapes(parsed)

  const normalized = normalizeWorkoutDraft(parsed)
  const result = workoutSchema.safeParse(normalized.normalized)

  if (!result.success) {
    return {
      workout: null,
      errors: formatZodIssues(result.error),
      warnings: normalized.warnings,
    }
  }

  return {
    workout: result.data,
    errors: [],
    warnings: [...normalized.warnings, ...collectSemanticIssues(result.data)],
  }
}

export function autoFixWarnings(draft) {
  let parsed

  try {
    parsed = JSON.parse(draft)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Invalid JSON')
  }

  const result = normalizeWorkoutDraft(parsed)

  // Return a pretty-printed JSON string of the normalized draft so the UI can replace it.
  return JSON.stringify(result.normalized, null, 2)
}

export function summarizeWorkout(workout) {
  const flatSteps = flattenSteps(workout.steps)
  const estimatedDistance = sumDistance(workout.steps, { expandRepeats: true })
  const templateDistance = sumDistance(workout.steps, { expandRepeats: false })

  return {
    name: workout.name,
    poolLength: workout.poolLength,
    poolLengthUnit: workout.poolLengthUnit,
    stepCount: flatSteps.length,
    estimatedDistance,
    templateDistance,
    distanceUnit: workout.poolLengthUnit,
  }
}

export function buildWorkoutFit(workout) {
  const encoder = new Encoder()
  const createdAt = new Date()
  const fileType = 'workout'
  const fitPoolUnit = mapPoolLengthUnit(workout.poolLengthUnit)
  // Keep workout distances in authored units; converting yards caused 50y to display as 47y on device.
  const distanceScale = 1
  const encodedPoolLength =
  workout.poolLengthUnit === 'yards'
    ? workout.poolLength * 0.9144
    : workout.poolLength

  let messageIndex = 0

  function countFitSteps(steps) {
    let count = 0

    steps.forEach((step) => {
      if (step.kind === 'repeat') {
        count += countFitSteps(step.steps)
        count += 1 // repeat marker step
      } else {
        count += 1
      }
    })

    return count
  }

  const numValidSteps = countFitSteps(workout.steps)

  function writeNormalStep(step) {
    const index = messageIndex
    messageIndex += 1

    const isRest = step.kind === 'rest'
    const isDistance = step.duration.kind === 'distance'
    const isOpenRest = isRest && (step.duration.kind === 'lapButton' || step.duration.kind === 'open')
    const stepNotes = typeof step.notes === 'string' && step.notes.trim().length > 0
      ? step.notes
      : isRest && typeof step.label === 'string' && step.label.trim().length > 0
        ? step.label
        : ''

    const durationType = isOpenRest ? 'open' : isDistance ? 'distance' : 'time'
    const durationValue = isOpenRest
      ? 0
      : isDistance
        ? workout.poolLengthUnit === 'yards' ? Math.round(step.duration.value * distanceScale * 91.44) :  Math.round(step.duration.value * distanceScale * 100)
        : Math.round(step.duration.value * 1000)

    const targetValue = step.kind === 'swim' ? strokeToFitValue[step.stroke] ?? 0 : 0

    encoder.writeMesg({
      mesgNum: Profile.MesgNum.WORKOUT_STEP,
      messageIndex: index,
      wktStepName: humanizeStep(step, index),
      notes: stepNotes,
      durationType,
      durationValue,
      intensity: isRest ? 'rest' : step.intensity,
      targetType: isRest ? 'open' : 'swimStroke',
      targetValue,
      secondaryTargetType: isRest ? 'open' : 'swimStroke',
      secondaryTargetValue: targetValue,
    })
  }

  function writeRepeatStep(repeatStep, firstRepeatedStepIndex) {
    const index = messageIndex
    messageIndex += 1

    console.log({
        messageIndex: index,
        durationType: "repeatUntilStepsCmplt",
        durationStep: firstRepeatedStepIndex,
        repeatSteps: repeatStep.times,
    })

    encoder.writeMesg({
        mesgNum: Profile.MesgNum.WORKOUT_STEP,
        messageIndex: index,
        durationType: "repeatUntilStepsCmplt",
        durationValue: firstRepeatedStepIndex,
        targetValue: repeatStep.times
    })
  }

  function writeSteps(steps) {
    steps.forEach((step) => {
      if (step.kind === 'repeat') {
        const firstRepeatedStepIndex = messageIndex

        writeSteps(step.steps)
        writeRepeatStep(step, firstRepeatedStepIndex)

        return
      }

      writeNormalStep(step)
    })
  }

  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: fileType,
    manufacturer: 'garmin',
    product: 0,
    timeCreated: createdAt,
  })

  encoder.writeMesg({
    mesgNum: Profile.MesgNum.TRAINING_FILE,
    type: fileType,
    manufacturer: 'garmin',
    product: 0,
    timeCreated: createdAt,
  })

  encoder.writeMesg({
    mesgNum: Profile.MesgNum.WORKOUT,
    sport: workout.sport,
    subSport: workout.subSport,
    numValidSteps,
    wktName: workout.name,
    poolLength: encodedPoolLength,
    poolLengthUnit: fitPoolUnit,
    wktDescription: workout.notes ?? '',
    equipment: workout.equipment ?? 'none',
  })

  encoder.writeMesg({
    mesgNum: Profile.MesgNum.WORKOUT_SESSION,
    sport: workout.sport,
    subSport: workout.subSport,
    numValidSteps,
    firstStepIndex: 0,
    poolLength: encodedPoolLength,
    poolLengthUnit: fitPoolUnit,
  })

  writeSteps(workout.steps)

  return encoder.close()
}