import { Request, Response } from "express";
import db from "../database/connection";
import convertHourToMinutes from "../utils/convertHourToMinutes";

interface ScheduleItem {
  week_day: number;
  from: string;
  to: string;
}

export default class ClassesController {
  async index(req: Request, res: Response) {
    const filters = req.query;

    const week_day = Number(filters.week_day);
    const subject = filters.subject as string;
    const time = filters.time as string;

    if (!week_day && !subject && !time) {
      return res.status(400).json({
        error: "Missing filters to search classes",
      });
    }

    const timeInMinutes = convertHourToMinutes(time);

    const classes = await db("classes")
      .whereExists(function () {
        this.select("class_schedule.*")
          .from("class_schedule")
          .whereRaw("`class_schedule`.`id` = `classes`.`id`")
          .whereRaw("`class_schedule`.`week_day` = ??", [week_day])
          .whereRaw("`class_schedule`.`from` <= ??", [timeInMinutes])
          .whereRaw("`class_schedule`.`to` > ??", [timeInMinutes]);
      })
      .select(["classes.*", "users.*"])
      .where("classes.subject", "=", subject)
      .join("users", "classes.user_id", "=", "users.id");

    return res.json(classes);
  }

  async create(req: Request, res: Response) {
    const { name, avatar, whatsapp, bio, subject, cost, schedule } = req.body;

    const trx = await db.transaction();

    try {
      const insertedUsersIds = await trx("users").insert({
        name,
        avatar,
        whatsapp,
        bio,
      });

      const user_id = insertedUsersIds[0];

      const insertedClassesIds = await trx("classes").insert({
        subject,
        cost,
        user_id,
      });

      const class_id = insertedClassesIds[0];

      const classSchedule = schedule.map((item: ScheduleItem) => {
        return {
          week_day: item.week_day,
          from: convertHourToMinutes(item.from),
          to: convertHourToMinutes(item.to),
          class_id,
        };
      });

      await trx("class_schedule").insert(classSchedule);

      await trx.commit();

      res.status(201).send();
    } catch (error) {
      await trx.rollback();

      return res.status(400).json({
        error: "Unexpected error while creating new classes",
      });
    }
  }
}
