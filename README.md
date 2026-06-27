FitBuilder for swim workouts is a web app that is designed to run in any
browser. The goal is to use any AI agent that you have access to and
supply it with a set of rules to follow. Once it has the rules in a
single chat session it should continue to adhere to the rules. If you
start a new chat session you will most likely need to reseed it with the
rules. The following lists the rules and can be copied to the clipboard
by clicking the "AI Rules" button. So far I have tested this with
ChatGPT.com and CoPilot. You can use any AI client you want and I'd love
to hear about the experience.\
\

# Begin AI Instructions

Convert the swim workout below into JSON for the Garmin FIT Swim Workout Builder.

Return **only valid JSON** using **2-space indentation**.

Do not return Markdown, comments, explanations, or any text other than the JSON.

The JSON must conform exactly to the supported JSON contract below.

---

# Generation Rules

## 1. Model the workout as it is performed.

Represent the workout exactly as a swimmer performs it in the pool, not how it is written on paper.

Preserve the coach's intent. Only change the structure when necessary to produce a correct Garmin workout.

---

## 2. Equipment changes and instructional pauses occur once.

Equipment changes and instructional pauses are **never** inside a repeat.

Generate an **open rest** before the repeat begins.

Correct

```
Equipment Change (Open Rest)

Repeat
    Swim
    Rest
```

Incorrect

```
Repeat
    Equipment Change
    Swim
    Rest
```

Use an open rest whenever the swimmer must perform an action before continuing.

Example:

```json
{
  "kind": "rest",
  "label": "Equipment change",
  "notes": "Put on fins.",
  "duration": {
    "kind": "open"
  },
  "intensity": "rest"
}
```

---

## 3. A continuous swim is one swim step.

A swim step represents one continuous swim.

Do not split a continuous swim into multiple swim steps unless the swimmer is expected to stop between them.

Example workout

```
50 as

25 catch-up drill

25 freestyle
```

Generate

```json
{
  "kind": "swim",
  "label": "50 as 25 catch-up drill, 25 freestyle",
  "notes": "First 25 catch-up drill. Second 25 freestyle.",
  "duration": {
    "kind": "distance",
    "value": 50
  },
  "stroke": "drill",
  "intensity": "active"
}
```

The watch should not stop halfway through a continuous swim.

---

## 4. Timed rests belong inside the repeat.

Example

```
3 x 100
:15 rest
```

Generate

```
Repeat
    Swim
    Rest
```

The timed rest occurs after every repetition.

---

## 5. Labels identify the workout step.

Keep labels short.

Examples

```
100 Free
50 Pull
Equipment Change
```

Do not place coaching instructions in labels.

---

## 6. Coaching belongs in notes.

Use the optional `notes` property for coaching instructions.

Examples

- Breathe every 3 strokes.
- Focus on distance per stroke.
- Reach forward and tap your leg during the pull.

If there are no coaching instructions, omit the `notes` property.

---

## 7. Preserve the coach's wording.

Do not summarize coaching instructions.

Do not abbreviate drill names.

Do not simplify workout descriptions.

If the workout already has a name, preserve it.

---

## 8. Preserve workout values.

Do not change:

- distances
- times
- repetition counts
- pool units

Do not convert between yards and meters.

---

## 9. Preserve workout structure.

Do not flatten repeat blocks.

Do not move rest periods.

Do not insert additional swim steps.

If the workout is ambiguous, preserve the coach's wording rather than guessing.

---

## 10. Use only the supported JSON contract.

Never invent properties.

Never invent enum values.

---

# Supported JSON Contract

## Workout

```text
    name             string (required)
    sport            "swimming"
    subSport         "lapSwimming"
    poolLength       positive number
    poolLengthUnit   "yards" | "meters"
    notes            optional string
    equipment        optional
    steps            array
```

Maximum 40 top-level steps.

---

## Equipment Values

```text
    none
    swimFins
    swimKickboard
    swimPaddles
    swimPullBuoy
    swimSnorkel
```

---

## Step Types

A step must be one of:

- swim
- rest
- repeat

---

## Swim Step

```json
{
  "kind": "swim",
  "label": "100 Free",
  "notes": "Optional coaching notes.",
  "duration": {
    "kind": "distance",
    "value": 100
  },
  "stroke": "freestyle",
  "intensity": "active",
  "target": {
    "kind": "pace",
    "value": "01:45"
  },
  "zone": 3
}
```

### Swim Duration

```text
    distance
    time
```

### Stroke Values

```text
  freestyle
  backstroke
  breaststroke
  butterfly
  drill
  mixed
  im
  imByRound
  rimo
```

### Intensity Values

```text
    active
    rest
    warmup
    cooldown
    recovery
    interval
```

---

## Rest Step

Timed Rest

```json
{
  "kind": "rest",
  "label": "15 sec rest",
  "duration": {
    "kind": "time",
    "value": 15
  },
  "intensity": "rest"
}


Open Rest

```json
{
  "kind": "rest",
  "label": "Equipment change",
  "notes": "Put on fins.",
  "duration": {
    "kind": "open"
  },
  "intensity": "rest"
}
```

### Rest Duration Values

```text
    time
    open
```

---

## Repeat Step

```json
{
  "kind": "repeat",
  "label": "4 x 100 Free",
  "times": 4,
  "steps": [
    {
      "kind": "swim",
      "label": "100 Free",
      "duration": {
        "kind": "distance",
        "value": 100
      },
      "stroke": "freestyle",
      "intensity": "active"
    },
    {
      "kind": "rest",
      "label": "15 sec rest",
      "duration": {
        "kind": "time",
        "value": 15
      },
      "intensity": "rest"
    }
  ]
}


---

Workout to convert:
<PASTE SWIM WORKOUT HERE>

# End AI Instructions
