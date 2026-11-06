import { z } from 'zod';
const n=z.number().finite().nonnegative();
const profile=z.object({name:z.string().min(1).max(100),age:n.min(14).max(110),height:n.min(100).max(250),weight:n.min(25).max(400),goalWeight:n.min(25).max(400),weeklyGoal:n.int().min(1).max(7)});
const meal=z.object({id:z.string(),name:z.string(),slot:z.string(),calories:n,protein:n,carbs:n,fat:n,checked:z.boolean(),ingredients:z.array(z.object({foodId:z.string(),grams:n.max(10000)})).optional(),grams:n.optional(),per100:z.object({calories:n,protein:n,carbs:n,fat:n}).optional()}).passthrough();
const exercise=z.object({id:z.string(),name:z.string(),focus:z.string(),cue:z.string(),videoId:z.string(),seconds:n.min(1).max(600),stage:z.enum(['Riscaldamento','Allenamento','Stretching'])}).passthrough();
const setup=z.object({name:z.string(),age:n,height:n,weight:n,goalWeight:n,weeklyGoal:n,goal:z.enum(['lose_fat','recomp','build_muscle','endurance','maintain']),sex:z.enum(['male','female','other']),activity:z.enum(['sedentary','light','moderate','active']),experience:z.enum(['beginner','intermediate','advanced']),diet:z.enum(['balanced','high_protein','mediterranean','vegetarian']),cookTime:z.enum(['low','medium','high']),habitsNotes:z.string()}).passthrough();
export const backupSchema=z.object({
 profile,meals:z.array(meal).optional(),shopping:z.array(z.object({id:z.string(),name:z.string(),category:z.string(),checked:z.boolean()})).optional(),
 weightData:z.array(z.object({date:z.string(),value:n.min(25).max(400)})).optional(),water:n.optional(),steps:n.optional(),completedWorkout:z.boolean().optional(),
 metrics:z.object({waist:n,workoutsCompleted:n,streakDays:n,lastWorkoutDate:z.string(),photoDataUrl:z.string().nullable()}).passthrough().optional(),
 todayActivity:z.string().optional(),setup:setup.nullable().optional(),workoutQueue:z.array(exercise).optional(),workoutMeta:z.object({title:z.string(),summary:z.string(),focus:z.string(),weekLabel:z.string(),goalLabel:z.string(),dietLabel:z.string()}).optional(),
 onboarded:z.boolean().optional(),dayKey:z.string().optional(),autoAdapt:z.boolean().optional(),voiceEnabled:z.boolean().optional(),queueDate:z.string().optional(),
 history:z.array(z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),meals:z.array(meal),water:n,steps:n,workoutDone:z.boolean(),activity:z.string(),target:n,weight:n})).optional(),
 overrides:z.record(z.object({kind:z.enum(['workout','sport','rest']),label:z.string(),minutes:n.max(240)})).optional(),coachMessages:z.array(z.object({id:z.string(),role:z.enum(['user','coach']),text:z.string()})).optional(),
}).passthrough();
